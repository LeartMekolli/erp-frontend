import type { MeResponse, PartnerMeResponse } from "../../src/lib/api/schema-types";
import {
  FAKE_PASSWORD,
  INVITATIONS,
  PARTNER_NAMES,
  RESET_TOKEN,
  STAFF,
  TENANT_ID,
  USED_TOKEN,
  USERS,
  WORKSPACE,
  WORKSPACE_INFO,
  type FakeUser,
} from "./seed";

/** What erp-api's login and refresh answer (`session.service.ts:22-26`). */
export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

type Status<S extends number> = { status: S };

const ACCESS_TOKEN_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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

  function issue(email: string, session: string): SessionTokens {
    const access = `fake-access.${crypto.randomUUID()}`;
    const refresh = `${TENANT_ID}.${crypto.randomUUID().replaceAll("-", "")}`;
    const expiresAt = now() + ACCESS_TOKEN_MS;
    accessTokens.set(access, { email, expiresAt, denied: false });
    refreshTokens.set(refresh, { email, session, used: false });
    return { access_token: access, refresh_token: refresh, expires_at: new Date(expiresAt).toISOString() };
  }

  function authenticate(accessToken: string): FakeUser | null {
    const entry = accessTokens.get(accessToken);
    if (!entry || entry.denied || now() >= entry.expiresAt) return null;
    return accounts.get(entry.email)?.user ?? null;
  }

  return {
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

    acceptStaffInvitation(token: string, name: string, password: string): Status<204 | 400> {
      const invitation = INVITATIONS[token as keyof typeof INVITATIONS];
      if (!invitation || invitation.kind !== "staff" || spentTokens.has(token)) return { status: 400 };
      spentTokens.add(token);
      accounts.set(invitation.email, {
        user: { id: crypto.randomUUID(), email: invitation.email, name, kind: "staff", permissions: ["order.read"], organisations: [] },
        password,
      });
      return { status: 204 };
    },

    acceptPartnerInvitation(token: string, name?: string, password?: string): Status<204 | 400> {
      const invitation = INVITATIONS[token as keyof typeof INVITATIONS];
      if (!invitation || invitation.kind !== "partner" || spentTokens.has(token)) return { status: 400 };
      const existing = accounts.get(invitation.email);
      if (existing) {
        // erp-api ignores the name and password of someone who already has an account.
        existing.user.organisations.push(invitation.partnerId);
      } else {
        if (!name || !password) return { status: 400 };
        accounts.set(invitation.email, {
          user: { id: crypto.randomUUID(), email: invitation.email, name, kind: "partner", permissions: [], organisations: [invitation.partnerId] },
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
        workspace: WORKSPACE_INFO,
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
          role: "owner" as const,
          status: "approved" as const,
        })),
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
