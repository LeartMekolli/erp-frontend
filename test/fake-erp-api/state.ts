import type { InvitationPreview, MeResponse, PartnerMeResponse, PartnerStatus, paths, StaffPartner } from "../../src/lib/api/schema-types";
import {
  FAKE_PASSWORD,
  INVITATIONS,
  ORGANISATION_NAMES,
  PARTNER_NAMES,
  RESET_TOKEN,
  STAFF,
  TENANT_ID,
  USED_TOKEN,
  USERS,
  WORKSPACE,
  WORKSPACE_INFO,
  type FakeInvitation,
  type FakeUser,
} from "./seed";
import { createAiStore } from "./ai";
import { createCatalogStore } from "./catalog";
import { createCommentsStore } from "./comments";
import { createJobsStore } from "./jobs";
import { createEarningsStore } from "./earnings";
import { createNotificationsStore } from "./notifications";
import { createOrdersStore, type Answer } from "./orders";
import { createPartnerDashboardStore } from "./partner-dashboard";
import { createPartnerJobsStore } from "./partner-jobs";
import { createPartnersStore } from "./partners";
import { createProductionStore } from "./production";
import { createQuotesStore, type QuoteFile } from "./quotes";
import { createReportsStore } from "./reports";

/** What erp-api's login and refresh answer (`session.service.ts:22-26`). */
export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

type Status<S extends number> = { status: S };

type StartFileBody = paths["/files"]["post"]["requestBody"]["content"]["application/json"];
type StartFileResponse = paths["/files"]["post"]["responses"][201]["content"]["application/json"];
type FileResponse = paths["/files/{id}"]["get"]["responses"][200]["content"]["application/json"];
type VersionResponse = StartFileResponse["version"];

/** What reached storage through a signed link. */
export interface StoredObject {
  contentType: string;
  size: number;
}

interface FakeVersion {
  view: VersionResponse;
  measures: FileResponse["versions"][number]["measures"];
  expiresAt: number;
  stored?: StoredObject;
}

interface FakeFile {
  view: StartFileResponse["file"];
  versions: FakeVersion[];
}

const ACCESS_TOKEN_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** How long a signed upload link lasts (erp-api `files.service.ts:28`). */
const UPLOAD_LINK_MS = 15 * 60 * 1000;
/** A version's next status on each read once its bytes are in: erp-api's measuring job, one step per poll. */
const MEASURING: Partial<Record<VersionResponse["status"], VersionResponse["status"]>> = { uploaded: "measuring", measuring: "measured" };

/** The measures the fake finds in every design: a 22 × 18 × 4 mm part. */
const DESIGN_MEASURES: FakeVersion["measures"] = [
  { type: "volume", value: "1240", unit: "mm3" },
  { type: "surface_area", value: "1860", unit: "mm2" },
  { type: "bounding_box_x", value: "22", unit: "mm" },
  { type: "bounding_box_y", value: "18", unit: "mm" },
  { type: "bounding_box_z", value: "4", unit: "mm" },
];

/**
 * An in-memory erp-api that keeps the rules AMI's session depends on:
 * refresh tokens work once and reuse revokes the session, logout revokes and
 * denies at once, every failed login is the same 401, 429 after 10 failures.
 */
export function createFakeState(now: () => number = Date.now) {
  const accounts = new Map<string, { user: FakeUser; password: string }>(
    USERS.map((user) => [user.email, { user: structuredClone(user), password: FAKE_PASSWORD }]),
  );
  const accessTokens = new Map<string, { email: string; expiresAt: number; denied: boolean }>();
  const refreshTokens = new Map<string, { email: string; session: string; used: boolean }>();
  const revokedSessions = new Set<string>();
  const failures = new Map<string, { count: number; since: number }>();
  const spentTokens = new Set<string>([USED_TOKEN]);
  const files = new Map<string, FakeFile>();
  const orders = createOrdersStore(now);
  const production = createProductionStore(now);
  const jobs = createJobsStore(now, orders);
  const comments = createCommentsStore(now, orders);
  const notifications = createNotificationsStore(now);
  const ai = createAiStore(now);
  const partnerJobs = createPartnerJobsStore(now, production);
  const earnings = createEarningsStore(now);
  const reports = createReportsStore(now, orders.all);
  const partnerDashboard = createPartnerDashboardStore(now);
  const suspended = new Set<string>();
  /** Workshops still being set up; the seeded ones were approved, so a test puts one here. */
  const settingUp = new Set<string>();
  /** When each workshop's owner submitted its setup (erp-api `partners.service.ts:150-166`). */
  const submitted = new Map<string, string>();
  const statusOf = (id: string): PartnerStatus => (suspended.has(id) ? "suspended" : settingUp.has(id) ? "setting_up" : "approved");
  const partners = createPartnersStore((id) => earnings.account(id).state, statusOf, (id) => submitted.get(id) ?? null);
  const catalog = createCatalogStore(orders.all);

  /** A file version for quoting: its file's owner and name, and its status as it is (reading it here measures nothing). */
  function fileVersion(versionId: string): QuoteFile | null {
    for (const file of files.values()) {
      const version = file.versions.find((v) => v.view.id === versionId);
      if (version) return { fileId: file.view.id, name: file.view.name, owner: file.view.owner, status: version.view.status };
    }
    return null;
  }

  const quotes = createQuotesStore(now, catalog, fileVersion, orders);

  /** The file, if the caller may see it: a partner route only sees that workshop's files. */
  function ownFile(fileId: string, partnerId?: string): FakeFile | null {
    const file = files.get(fileId);
    if (!file) return null;
    if (partnerId !== undefined && (file.view.owner?.type !== "partner" || file.view.owner.id !== partnerId)) return null;
    return file;
  }

  function issue(email: string, session: string): SessionTokens {
    const access = `fake-access.${crypto.randomUUID()}`;
    const refresh = `${TENANT_ID}.${crypto.randomUUID().replaceAll("-", "")}`;
    const expiresAt = now() + ACCESS_TOKEN_MS;
    accessTokens.set(access, { email, expiresAt, denied: false });
    refreshTokens.set(refresh, { email, session, used: false });
    return { access_token: access, refresh_token: refresh, expires_at: new Date(expiresAt).toISOString() };
  }

  /** An invitation of this kind that can still be accepted. */
  function pending(token: string, kind: FakeInvitation["kind"]): FakeInvitation | null {
    const invitation = INVITATIONS[token];
    if (!invitation || invitation.kind !== kind || invitation.expired || spentTokens.has(token)) return null;
    return invitation;
  }

  function authenticate(accessToken: string): FakeUser | null {
    const entry = accessTokens.get(accessToken);
    if (!entry || entry.denied || now() >= entry.expiresAt) return null;
    return accounts.get(entry.email)?.user ?? null;
  }

  return {
    orders,
    production,
    jobs,
    comments,
    notifications,
    ai,
    partnerJobs,
    earnings,
    reports,
    partnerDashboard,
    partners,
    catalog,
    quotes,

    /** Suspends a workshop: `/partner-portal/me` says so, and its accept and decline routes answer 403. */
    suspendPartner(id: string): void {
      suspended.add(id);
    },

    isPartnerSuspended(id: string): boolean {
      return suspended.has(id);
    },

    /** Puts a workshop back to being set up and not approved; a submission it already made stays. */
    setPartnerSettingUp(id: string): void {
      settingUp.add(id);
    },

    /** Staff approve a workshop being set up. */
    approvePartner(id: string): void {
      settingUp.delete(id);
    },

    /** `POST /partner-portal/partners/{partnerId}/submit`: the first submission is kept; a workshop not being set up is a 409. */
    submitSetup(id: string): Answer<StaffPartner> {
      if (statusOf(id) !== "setting_up") return { ok: false, status: 409, detail: "Only a partner being set up can be submitted for approval" };
      if (!submitted.has(id)) submitted.set(id, new Date(now()).toISOString());
      return partners.get(id);
    },

    login(workspace: string | undefined, email: string, password: string): SessionTokens | Status<401 | 429> {
      if (workspace !== WORKSPACE) return { status: 401 };
      const key = email.trim().toLowerCase();
      const failed = failures.get(key);
      if (failed && now() - failed.since >= LOGIN_WINDOW_MS) failures.delete(key);
      if ((failures.get(key)?.count ?? 0) >= LOGIN_LIMIT) return { status: 429 };

      const account = accounts.get(key);
      if (!account || account.password !== password) {
        const entry = failures.get(key) ?? { count: 0, since: now() };
        failures.set(key, { ...entry, count: entry.count + 1 });
        return { status: 401 };
      }
      failures.delete(key);
      return issue(key, crypto.randomUUID());
    },

    refresh(refreshToken: string): SessionTokens | Status<401> {
      const entry = refreshTokens.get(refreshToken);
      if (!entry || revokedSessions.has(entry.session)) return { status: 401 };
      if (entry.used) {
        revokedSessions.add(entry.session);
        return { status: 401 };
      }
      entry.used = true;
      return issue(entry.email, entry.session);
    },

    logout(accessToken: string, refreshToken: string): Status<204 | 401> {
      const user = authenticate(accessToken);
      if (!user) return { status: 401 };
      const entry = refreshTokens.get(refreshToken);
      if (entry?.email === user.email) revokedSessions.add(entry.session);
      accessTokens.get(accessToken)!.denied = true;
      return { status: 204 };
    },

    authenticate,

    /** `POST /auth/invitations/preview` (`invitation-preview.service.ts`). */
    previewInvitation(token: string): InvitationPreview | Status<404> {
      const invitation = INVITATIONS[token];
      if (!invitation) return { status: 404 };
      return {
        kind: invitation.kind,
        status: spentTokens.has(token) ? "accepted" : invitation.expired ? "expired" : "pending",
        email: invitation.email,
        role: invitation.role,
        workspace: { name: WORKSPACE_INFO.name },
        organisation: invitation.organisationId ? { name: ORGANISATION_NAMES[invitation.organisationId] ?? "" } : null,
        has_account: accounts.has(invitation.email),
      };
    },

    /** 409 for an email that already has an account; the invitation stays pending (erp-api rolls back). */
    acceptStaffInvitation(token: string, name: string, password: string): Status<204 | 400 | 409> {
      const invitation = pending(token, "staff");
      if (!invitation) return { status: 400 };
      if (accounts.has(invitation.email)) return { status: 409 };
      spentTokens.add(token);
      accounts.set(invitation.email, {
        user: { id: crypto.randomUUID(), email: invitation.email, name, kind: "staff", permissions: ["order.read"], organisations: [] },
        password,
      });
      return { status: 204 };
    },

    /** 409 for an email of another kind, or someone already acting for the partner (`partner-invitations.service.ts:173-179`). */
    acceptPartnerInvitation(token: string, name?: string, password?: string): Status<204 | 400 | 409> {
      const invitation = pending(token, "partner");
      if (!invitation?.organisationId) return { status: 400 };
      const existing = accounts.get(invitation.email);
      if (existing) {
        if (existing.user.kind !== "partner" || existing.user.organisations.includes(invitation.organisationId))
          return { status: 409 };
        // erp-api ignores the name and password of someone who already has an account.
        existing.user.organisations.push(invitation.organisationId);
      } else {
        if (!name || !password) return { status: 400 };
        accounts.set(invitation.email, {
          user: { id: crypto.randomUUID(), email: invitation.email, name, kind: "partner", permissions: [], organisations: [invitation.organisationId] },
          password,
        });
      }
      spentTokens.add(token);
      return { status: 204 };
    },

    requestPasswordReset(): Status<202> {
      return { status: 202 };
    },

    confirmPasswordReset(token: string, password: string): Status<204 | 400> {
      if (token !== RESET_TOKEN || spentTokens.has(token)) return { status: 400 };
      spentTokens.add(token);
      accounts.get(STAFF.email)!.password = password;
      return { status: 204 };
    },

    me(user: FakeUser): MeResponse {
      return {
        kind: user.kind,
        user: { id: user.id, email: user.email, name: user.name, status: "active", locale: "en", created_at: "2026-01-05T09:00:00.000Z" },
        workspace: { ...WORKSPACE_INFO, labels_available: orders.labelsAvailable() },
        roles: user.permissions.length ? [{ id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a80", name: "Owner" }] : [],
        permissions: user.permissions,
        memberships:
          user.kind === "staff"
            ? []
            : user.organisations.map((id) => ({ organisation_type: user.kind, organisation_id: id, role: "owner" })),
      };
    },

    partnerMe(user: FakeUser): PartnerMeResponse | Status<403> {
      if (user.kind !== "partner") return { status: 403 };
      return {
        user: { id: user.id, name: user.name, email: user.email },
        partners: user.organisations.map((id) => ({
          id,
          display_name: PARTNER_NAMES[id] ?? "Workshop",
          role: user.partnerRole ?? ("owner" as const),
          status: statusOf(id),
          // Seeded partners were approved by staff without submitting (erp-api `partner-response.ts:539`).
          submitted_at: submitted.get(id) ?? null,
        })),
      };
    },

    /** `POST /files`, or the partner route with `partnerId` (`files.service.ts:96`, `:446-453`). */
    startFile(body: StartFileBody, at: { origin: string; partnerId?: string }): StartFileResponse {
      const createdAt = new Date(now()).toISOString();
      const owner = at.partnerId
        ? { type: "partner", id: at.partnerId }
        : body.customer_id
          ? { type: "customer", id: body.customer_id }
          : null;
      const file: FakeFile["view"] = {
        id: crypto.randomUUID(),
        kind: body.kind,
        name: body.name,
        declared_unit: body.declared_unit ?? null,
        owner,
        status: "active",
        created_at: createdAt,
      };
      const version: VersionResponse = {
        id: crypto.randomUUID(),
        number: 1,
        original_name: body.name,
        content_type: body.content_type,
        size: body.size,
        checksum: null,
        status: "pending",
        created_at: createdAt,
        completed_at: null,
      };
      const expiresAt = now() + UPLOAD_LINK_MS;
      files.set(file.id, { view: file, versions: [{ view: version, measures: [], expiresAt }] });
      return {
        file,
        version,
        upload: {
          url: `${at.origin}/__storage/uploads/${file.id}/${version.id}`,
          method: "PUT",
          headers: { "content-type": body.content_type, "content-length": String(body.size) },
          expires_at: new Date(expiresAt).toISOString(),
        },
      };
    },

    /** A PUT to a signed link: refused once the link has run out. */
    storeObject(fileId: string, versionId: string, object: StoredObject): Status<200 | 403 | 404> {
      const version = files.get(fileId)?.versions.find((v) => v.view.id === versionId);
      if (!version) return { status: 404 };
      if (now() >= version.expiresAt) return { status: 403 };
      version.stored = object;
      return { status: 200 };
    },

    /** 409 when nothing, or not what was declared, reached storage; completing again answers the version as it is (`files.service.ts:302-321`). */
    completeFile(fileId: string, versionId: string, partnerId?: string): VersionResponse | Status<404 | 409> {
      const file = ownFile(fileId, partnerId);
      const version = file?.versions.find((v) => v.view.id === versionId);
      if (!file || !version) return { status: 404 };
      if (version.view.status !== "pending") return version.view;
      const { stored } = version;
      if (!stored || stored.size !== version.view.size || stored.contentType !== version.view.content_type)
        return { status: 409 };
      version.view = { ...version.view, status: "uploaded", completed_at: new Date(now()).toISOString() };
      // What the measuring job finds in a design (`measurers.ts`); the version reads as measured two polls on.
      if (file.view.kind === "design") version.measures = DESIGN_MEASURES;
      return version.view;
    },

    /** `GET /files/{id}`: each read moves a completed version one step through measuring. */
    getFile(fileId: string, partnerId?: string): FileResponse | Status<404> {
      const file = ownFile(fileId, partnerId);
      if (!file) return { status: 404 };
      for (const version of file.versions) {
        const next = MEASURING[version.view.status];
        if (next) version.view = { ...version.view, status: next };
      }
      return {
        ...file.view,
        versions: file.versions.toReversed().map((v) => ({ ...v.view, measures: v.measures })),
      };
    },
  };
}

export type FakeState = ReturnType<typeof createFakeState>;

let current = createFakeState();

/** The state the handlers serve; replaced by `resetFakeState()` between tests. */
export function fakeState(): FakeState {
  return current;
}

export function resetFakeState(): void {
  current = createFakeState();
}
