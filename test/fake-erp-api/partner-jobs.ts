/**
 * The fake erp-api's jobs as a partner sees them (erp-api
 * `src/modules/partners/partner-jobs.service.ts`, `partner-jobs.controller.ts`
 * and `jobs.controller.ts`). They are their own list, not taken from the
 * fake's orders, so the staff tests don't change. Each workshop reads only its
 * own jobs; an offer past its deadline is let go on the spot.
 */

import type { JobAssignment, PartnerJob, PartnerJobDetail, PartnerJobStatus } from "../../src/lib/api/schema-types";

import type { Answer, Page } from "./orders";
import { groupIdOf, uuid } from "./orders-seed";
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

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;

/** A job as stored: what erp-api answers, and whether the partner declined it. */
interface Row {
  partnerId: string;
  job: PartnerJob;
  declined: boolean;
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

const notOffered = (detail: string): Answer<never> => ({ ok: false, status: 409, detail });
const jobNotFound: Answer<never> = { ok: false, status: 404, detail: "Job not found" };

export function createPartnerJobsStore(now: () => number) {
  const stamp = (ms = now()) => new Date(ms).toISOString();
  const day = (offsetDays: number) => stamp(now() + offsetDays * DAY_MS).slice(0, 10);
  const keys = new Map<string, { input: string; body: JobAssignment }>();

  const rows: Row[] = SEEDS.map((seed) => ({
    partnerId: seed.partnerId,
    declined: false,
    job: {
      id: seed.id,
      status: seed.status,
      offered_at: stamp(now() - seed.offeredHoursAgo * HOUR_MS),
      expires_at: seed.expiresInMs === null ? null : stamp(now() + seed.expiresInMs),
      due_on: day(seed.dueInDays),
      product: { name: seed.name },
      options: seed.options,
      quantity: seed.quantity,
      design_file_version_id: null,
      steps: [
        seed.partnerId === NORTHCAST_ID
          ? { key: "casting", name: "Casting", sop_file_version_id: null }
          : { key: "print", name: "Print", sop_file_version_id: null },
      ],
      cost: seed.cost,
      pieces: seed.pieces,
    },
  }));

  /** An offer still before its deadline. */
  const open = (row: Row) => row.job.status === "offered" && !row.declined && Date.parse(row.job.expires_at ?? "") > now();
  /** What erp-api calls the job: an accepted job with no active piece left is finished. */
  const statusOf = (row: Row): PartnerJobStatus =>
    row.job.status === "offered" ? "offered" : row.job.pieces.active > 0 ? "accepted" : "finished";
  /** The partner's own jobs: open offers and accepted jobs (`partner-jobs.service.ts:18`). */
  const visible = (row: Row) => open(row) || row.job.status !== "offered";
  const mine = (partnerId: string, groupId: string) => rows.find((r) => r.partnerId === partnerId && r.job.id === groupId);
  const view = (row: Row): PartnerJob => ({ ...structuredClone(row.job), status: statusOf(row) });

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
     * `GET .../jobs/{groupId}` (`partner-jobs.service.ts:72-121`): a job offered
     * to or accepted by this partner; any other is a 404. Part 2 fills in
     * `work_orders` and `summary`.
     */
    detail(partnerId: string, groupId: string): Answer<PartnerJobDetail> {
      const row = mine(partnerId, groupId);
      if (!row || !visible(row)) return jobNotFound;
      return { ok: true, body: { ...view(row), work_orders: [], summary: null } };
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
        if (answer === "accept") row.job = { ...row.job, status: "accepted", expires_at: null };
        else row.declined = true;
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
            expires_at: null,
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
