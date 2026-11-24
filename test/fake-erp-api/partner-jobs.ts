/**
 * The fake erp-api's jobs as a partner sees them (erp-api
 * `src/modules/partners/partner-jobs.service.ts`, `partner-jobs.controller.ts`
 * and `jobs.controller.ts`). They are their own list, not taken from the
 * fake's orders, so the staff tests don't change. Each workshop reads only its
 * own jobs; an offer past its deadline is let go on the spot. A job whose group
 * has pieces in the fake's production (Ring band, order #1048's line) takes its
 * steps, counts and pieces from there, so a move on either side shows on both.
 */

import type { JobAssignment, MoveBody, MoveResponse, PartnerJob, PartnerJobCounts, PartnerJobDetail, PartnerJobStatus } from "../../src/lib/api/schema-types";

import type { Answer, Page } from "./orders";
import { groupIdOf, uuid } from "./orders-seed";
import type { ProductionStore } from "./production";
import { LAYERLINE_ID, NORTHCAST_ID, PARTNER_NAMES } from "./seed";

const id = (n: number) => uuid("c1c1c1c1", n);

export const RING_OFFER_ID = id(1);
export const PENDANT_OFFER_ID = id(2);
/** The accepted job that is order #1048's line, so its pieces can be joined to that order's. */
export const RING_BAND_JOB_ID = groupIdOf(1048, 0);
export const EARRING_JOB_ID = id(4);
/** Northcast's accepted job with the 60-character name and three options. */
export const LONG_NAME_JOB_ID = id(5);
/** Layerline's only job. */
export const FACADE_OFFER_ID = id(6);

/** The longest a product name gets: 60 characters. */
export const LONG_PRODUCT_NAME = "Architectural facade panel with ventilation slots, 2 mm skin";

/** Ring band's design file, the only job with one. */
export const RING_BAND_DESIGN_ID = uuid("c5c5c5c5", 1);

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;

/** A job as stored: what erp-api answers, whether the partner declined it, and when it answered. */
interface Row {
  partnerId: string;
  job: PartnerJob;
  declined: boolean;
  respondedAt: string | null;
}

type Seed = {
  partnerId: string;
  id: string;
  name: string;
  options: PartnerJob["options"];
  status: PartnerJobStatus;
  quantity: number;
  dueInDays: number;
  cost: string;
  pieces: PartnerJob["pieces"];
  offeredHoursAgo: number;
  expiresInMs: number | null;
};

const material = (value: string) => [{ group: "Material", value }];

const SEEDS: Seed[] = [
  { partnerId: NORTHCAST_ID, id: RING_OFFER_ID, name: "Ring", options: material("Silver 925"), status: "offered", quantity: 10, dueInDays: 8, cost: "240.00", pieces: { active: 10, finished: 0, scrapped: 0 }, offeredHoursAgo: 1, expiresInMs: 5 * HOUR_MS + 12 * MINUTE_MS },
  { partnerId: NORTHCAST_ID, id: PENDANT_OFFER_ID, name: "Pendant", options: material("Gold 18k"), status: "offered", quantity: 3, dueInDays: 12, cost: "410.00", pieces: { active: 3, finished: 0, scrapped: 0 }, offeredHoursAgo: 2, expiresInMs: 90 * MINUTE_MS },
  { partnerId: NORTHCAST_ID, id: RING_BAND_JOB_ID, name: "Ring band", options: material("Brass"), status: "accepted", quantity: 12, dueInDays: 0, cost: "180.00", pieces: { active: 9, finished: 2, scrapped: 1 }, offeredHoursAgo: 5, expiresInMs: null },
  { partnerId: NORTHCAST_ID, id: EARRING_JOB_ID, name: "Earring", options: material("Silver 925"), status: "finished", quantity: 24, dueInDays: -3, cost: "96.00", pieces: { active: 0, finished: 24, scrapped: 0 }, offeredHoursAgo: 30, expiresInMs: null },
  {
    partnerId: NORTHCAST_ID,
    id: LONG_NAME_JOB_ID,
    name: LONG_PRODUCT_NAME,
    options: [
      { group: "Material", value: "Silver 925" },
      { group: "Finish", value: "Brushed satin with a hand-polished edge" },
      { group: "Colour", value: "Natural" },
    ],
    status: "accepted",
    quantity: 4,
    dueInDays: 5,
    cost: "1250.00",
    pieces: { active: 4, finished: 0, scrapped: 0 },
    offeredHoursAgo: 4,
    expiresInMs: null,
  },
  { partnerId: LAYERLINE_ID, id: FACADE_OFFER_ID, name: "Facade panel", options: material("Standard resin"), status: "offered", quantity: 4, dueInDays: 4, cost: "60.00", pieces: { active: 4, finished: 0, scrapped: 0 }, offeredHoursAgo: 1, expiresInMs: DAY_MS },
];

const STATUSES = ["offered", "accepted", "finished"] as const;
const isStatus = (value: string): value is PartnerJobStatus => (STATUSES as readonly string[]).includes(value);

type DetailStep = PartnerJobDetail["steps"][number];

/** A listed step as the detail sends it, with no rules and nothing inspected yet. */
const withRules = (step: PartnerJob["steps"][number]): DetailStep => ({
  ...step,
  checklist: [],
  defects: [],
  rework_targets: [],
  pass: { min_photos: 0, comment_required: false },
  fail: { min_photos: 0, comment_required: false },
  sampling: null,
  count: 0,
  in_rework: 0,
  passed: 0,
  failed: 0,
  not_inspected: 0,
  defect_counts: [],
  latest_check: null,
});

const notOffered = (detail: string): Answer<never> => ({ ok: false, status: 409, detail });
const jobNotFound: Answer<never> = { ok: false, status: 404, detail: "Job not found" };

const link = (fileVersionId: string, expiresAt: string) => ({ url: `https://storage.example.test/${fileVersionId}`, expires_at: expiresAt });

export function createPartnerJobsStore(now: () => number, production: ProductionStore) {
  const stamp = (ms = now()) => new Date(ms).toISOString();
  const day = (offsetDays: number) => stamp(now() + offsetDays * DAY_MS).slice(0, 10);
  const keys = new Map<string, { input: string; body: JobAssignment }>();

  const rows: Row[] = SEEDS.map((seed) => ({
    partnerId: seed.partnerId,
    declined: false,
    respondedAt: null,
    job: {
      id: seed.id,
      status: seed.status,
      offered_at: stamp(now() - seed.offeredHoursAgo * HOUR_MS),
      expires_at: seed.expiresInMs === null ? null : stamp(now() + seed.expiresInMs),
      due_on: day(seed.dueInDays),
      product: { name: seed.name },
      options: seed.options,
      quantity: seed.quantity,
      design_file_version_id: seed.id === RING_BAND_JOB_ID ? RING_BAND_DESIGN_ID : null,
      steps: [
        seed.partnerId === NORTHCAST_ID
          ? { key: "casting", name: "Casting", sop_file_version_id: null, count: seed.pieces.active }
          : { key: "print", name: "Print", sop_file_version_id: null, count: seed.pieces.active },
      ],
      cost: seed.cost,
      pieces: seed.pieces,
    },
  }));

  /** An offer still before its deadline. */
  const open = (row: Row) => row.job.status === "offered" && !row.declined && Date.parse(row.job.expires_at ?? "") > now();
  /** What erp-api calls the job: an accepted job with no active piece left is finished. */
  const statusOf = (row: Row): PartnerJobStatus => view(row).status;
  /** The partner's own jobs: open offers and accepted jobs (`partner-jobs.service.ts:18`). */
  const visible = (row: Row) => open(row) || row.job.status !== "offered";
  const mine = (partnerId: string, groupId: string) => rows.find((r) => r.partnerId === partnerId && r.job.id === groupId);
  /** A job the partner holds: accepted and not declined (erp-api `heldJob`); an offer, or anyone else's, isn't. */
  const held = (partnerId: string, groupId: string) => {
    const row = mine(partnerId, groupId);
    return row && row.job.status !== "offered" && !row.declined ? row : undefined;
  };
  /** When the job came to the partner: it accepted the offer, or else staff handed it over (erp-api `handedOverAt`). */
  const handedOverAt = (row: Row) => row.respondedAt ?? row.job.offered_at;

  /** A job's steps and counts from production where its group has pieces there. */
  function current(row: Row): PartnerJob {
    const group = production.group(row.job.id);
    if (!group.ok) return row.job;
    const view = production.partnerView(row.job.id, row.partnerId, null)!;
    return {
      ...row.job,
      pieces: group.body.pieces,
      steps: view.steps.map((step) => ({ key: step.key, name: step.name, sop_file_version_id: step.sop_file_version_id, count: step.count })),
    };
  }
  const view = (row: Row): PartnerJob => {
    const job = structuredClone(current(row));
    return { ...job, status: job.status === "offered" ? "offered" : job.pieces.active > 0 ? "accepted" : "finished" };
  };

  /** `once()` as in `jobs.ts`: the same key and request replays the first answer. */
  function once(key: string | null, input: unknown, run: () => Answer<JobAssignment>): Answer<JobAssignment> {
    const serialised = JSON.stringify(input);
    const seen = key ? keys.get(key) : undefined;
    if (seen)
      return seen.input === serialised
        ? { ok: true, body: seen.body }
        : { ok: false, status: 409, detail: "Idempotency key reused with a different request", code: "idempotency_key_reused" };
    const answer = run();
    if (answer.ok && key) keys.set(key, { input: serialised, body: answer.body });
    return answer;
  }

  return {
    /**
     * `GET .../jobs` (`partner-jobs.controller.ts:64-78`): newest hand-over
     * first, `status` applied before paging, offered and accepted when it's
     * left out. Offset cursors, as `notifications.ts` and `production.ts` page.
     */
    list(partnerId: string, params: URLSearchParams): Answer<Page<PartnerJob>> {
      const status = params.get("status");
      if (status !== null && !isStatus(status))
        return { ok: false, status: 400, errors: [{ path: "status", message: "must be offered, accepted or finished" }] };
      const limit = Number(params.get("limit") ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        return { ok: false, status: 400, errors: [{ path: "limit", message: "must be 1 to 200" }] };
      const offset = Number(params.get("cursor") ?? 0);
      if (!Number.isInteger(offset) || offset < 0)
        return { ok: false, status: 400, errors: [{ path: "cursor", message: "Invalid cursor" }] };

      const all = rows
        .filter((row) => row.partnerId === partnerId && visible(row) && (status === null ? statusOf(row) !== "finished" : statusOf(row) === status))
        .toSorted((a, b) => b.job.offered_at.localeCompare(a.job.offered_at))
        .map(view);
      return { ok: true, body: { data: all.slice(offset, offset + limit), next_cursor: offset + limit < all.length ? String(offset + limit) : null } };
    },

    /**
     * `GET .../jobs/counts` (`partner-jobs.service.ts:110-122`, `partner-jobs-query.ts:76-84`): the list's
     * statuses, plus the accepted jobs past their due day (`late`) and due from today to 2 working days on
     * (`due_soon`). The fake's workspace is on UTC.
     */
    counts(partnerId: string): PartnerJobCounts {
      const today = day(0);
      let dueSoonUntil = today;
      for (let added = 0; added < 2; ) {
        dueSoonUntil = new Date(Date.parse(`${dueSoonUntil}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
        const weekday = new Date(`${dueSoonUntil}T00:00:00Z`).getUTCDay();
        if (weekday !== 0 && weekday !== 6) added += 1;
      }
      const jobs = rows.filter((row) => row.partnerId === partnerId && visible(row)).map(view);
      const accepted = jobs.filter((job) => job.status === "accepted");
      return {
        offered: jobs.filter((job) => job.status === "offered").length,
        accepted: accepted.length,
        finished: jobs.filter((job) => job.status === "finished").length,
        late: accepted.filter((job) => job.due_on !== null && job.due_on < today).length,
        due_soon: accepted.filter((job) => job.due_on !== null && job.due_on >= today && job.due_on <= dueSoonUntil).length,
      };
    },

    /**
     * `GET .../jobs/{groupId}` (`partner-jobs.service.ts:107-210`): a job offered
     * to or accepted by this partner; any other is a 404. A job with pieces in
     * production sends its steps' rules and checks and every piece with its stage;
     * on an offer nothing is counted yet. The rest have no pieces and no summary.
     */
    detail(partnerId: string, groupId: string): Answer<PartnerJobDetail> {
      const row = mine(partnerId, groupId);
      if (!row || !visible(row)) return jobNotFound;
      const job = view(row);
      const pieces = production.partnerView(groupId, partnerId, row.job.status === "offered" ? null : handedOverAt(row));
      return { ok: true, body: { ...job, ...(pieces ?? { steps: job.steps.map(withRules), work_orders: [] }), summary: null } };
    },

    /** Whether the partner holds the job: the job's pieces, moves, files and comments are its own only then. */
    holds(partnerId: string, groupId: string): boolean {
      return held(partnerId, groupId) !== undefined;
    },

    /** `GET .../jobs/{groupId}/work-orders/{workOrderId}`: a piece of a job the partner holds; else a 404. */
    piece(partnerId: string, groupId: string, workOrderId: string) {
      if (!held(partnerId, groupId)) return jobNotFound;
      return production.partnerPiece(groupId, workOrderId, partnerId);
    },

    /** `GET .../jobs/{groupId}/moves`: every move on the job's pieces, with when it came to the partner. */
    moves(partnerId: string, groupId: string, params: URLSearchParams) {
      const row = held(partnerId, groupId);
      if (!row) return jobNotFound;
      return production.partnerMoves(groupId, params, partnerId, handedOverAt(row));
    },

    /** `GET .../jobs/{groupId}/moves/{moveId}/photos/{fileVersionId}/url`. */
    photoUrl(partnerId: string, groupId: string, moveId: string, fileVersionId: string) {
      if (!held(partnerId, groupId)) return jobNotFound;
      return production.partnerPhoto(groupId, moveId, fileVersionId);
    },

    /** `GET .../jobs/{groupId}/design`: the design file's link, once the partner holds the job (`partner-jobs.service.ts:262`). */
    design(partnerId: string, groupId: string): Answer<{ url: string; expires_at: string }> {
      const row = held(partnerId, groupId);
      if (!row) return jobNotFound;
      const version = row.job.design_file_version_id;
      if (!version) return { ok: false, status: 404, detail: "Design file not found" };
      return { ok: true, body: link(version, stamp(now() + 5 * MINUTE_MS)) };
    },

    /** `GET .../jobs/{groupId}/steps/{stepKey}/sop`: instructions of one of the partner's steps on a job it holds. */
    sop(partnerId: string, groupId: string, stepKey: string): Answer<{ url: string; expires_at: string }> {
      if (!held(partnerId, groupId)) return jobNotFound;
      const version = production.partnerView(groupId, partnerId, null)?.steps.find((step) => step.key === stepKey)?.sop_file_version_id;
      if (!version) return { ok: false, status: 404, detail: "Step instructions not found" };
      return { ok: true, body: link(version, stamp(now() + 5 * MINUTE_MS)) };
    },

    /** `POST /partner-portal/partners/{partnerId}/moves`: moves pieces of the partner's jobs, by one of its people. */
    move(partnerId: string, body: MoveBody, key: string | null, person: { id: string; name: string }): Answer<MoveResponse> {
      const partner = { id: partnerId, name: PARTNER_NAMES[partnerId] ?? "Workshop" };
      return production.partnerMove(body, key, { actor: person, partner }, (groupId) => held(partnerId, groupId) !== undefined);
    },

    /**
     * `POST .../jobs/{groupId}/accept` and `.../decline` (`jobs.controller.ts:165-205`):
     * a job not offered to the partner is a 404; one no longer offered, or past
     * its deadline, is a 409. A suspended partner's 403 is the route's.
     */
    answer(partnerId: string, groupId: string, answer: "accept" | "decline", key: string | null): Answer<JobAssignment> {
      return once(key, { partnerId, groupId, answer }, () => {
        const row = mine(partnerId, groupId);
        if (!row) return jobNotFound;
        if (!open(row)) return notOffered("The offer is no longer open");
        // erp-api keeps the offer's deadline on the accepted job (`partner-jobs.service.ts:316`).
        if (answer === "accept") row.job = { ...row.job, status: "accepted" };
        else row.declined = true;
        row.respondedAt = stamp();
        return {
          ok: true,
          body: {
            id: crypto.randomUUID(),
            group_id: groupId,
            partner: { id: partnerId, name: PARTNER_NAMES[partnerId] ?? "Workshop" },
            kind: "offer",
            status: answer === "accept" ? "accepted" : "declined",
            cost: row.job.cost,
            owed_override: null,
            expires_at: row.job.expires_at,
            due_on: row.job.due_on,
            responded_at: stamp(),
            created_at: row.job.offered_at,
          },
        };
      });
    },
  };
}

export type PartnerJobsStore = ReturnType<typeof createPartnerJobsStore>;
