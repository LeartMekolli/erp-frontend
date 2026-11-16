/**
 * The fake erp-api's partner pay (erp-api `src/modules/partners/jobs.service.ts`
 * `owed`, `src/modules/payments/payouts.service.ts` and
 * `payout-accounts.service.ts`). Each job keeps what it's worth and what payouts
 * hold for it; `due` and the totals are worked out from those on every read, as
 * erp-api does, so settling a payout moves them. Amounts are kept in cents.
 */

import type { JobOrder, OwedJob, PartnerOwed, PartnerPayout, PayoutAccountState, StaffOwedJob, StaffPartnerOwed, StaffPayout } from "../../src/lib/api/schema-types";

import type { Answer, Page } from "./orders";
import { uuid } from "./orders-seed";
import { RING_BAND_JOB_ID } from "./partner-jobs";
import { LAYERLINE_ID, NORTHCAST_ID } from "./seed";

const DAY_MS = 24 * 3_600_000;
const CURRENCY = "EUR";
/** How long a payout account link works (erp-api's provider sets its own; a few minutes). */
const LINK_MS = 5 * 60_000;

interface Job {
  id: string;
  groupId: string;
  name: string | null;
  quantity: number;
  state: OwedJob["state"];
  holding: OwedJob["holding"];
  amount: number;
  paid: number;
  /** The order and line it is from; only staff see it. */
  order: JobOrder | null;
  customerPaid: boolean | null;
  overrideReason: string | null;
}

interface Payout {
  id: string;
  partnerId: string;
  amount: number;
  status: PartnerPayout["status"];
  /** The provider's words for a payout it refused; only staff see it. */
  failure: string | null;
  createdAt: number;
  settledAt: number | null;
  jobs: { jobId: string; amount: number }[];
}

const money = (cents: number) => (cents / 100).toFixed(2);

const jobId = (n: number) => uuid("c6c6c6c6", n);
const groupId = (n: number) => uuid("c7c7c7c7", n);
const payoutId = (n: number) => uuid("c8c8c8c8", n);
/** A seeded order's line, by the order's number (ids as in `orders-seed.ts`). */
const orderOf = (number: number, linePosition: number): JobOrder => ({ id: uuid("22222222", number), number, line_position: linePosition });

/** Payout ids, so tests can name them. */
export const PENDING_PAYOUT_ID = payoutId(3);
export const PAID_PAYOUT_ID = payoutId(2);
export const FAILED_PAYOUT_ID = payoutId(1);

/** The job taken back from Northcast with nothing set: it reads as owed 0. */
export const TAKEN_BACK_JOB_ID = jobId(22);

/**
 * Northcast's 25 hand-overs, newest first. Owed now is 1,240.00 (900 + 460 less
 * the 120 paid for a job sent back before the payout step); still being earned
 * 380.00 over 3 jobs. The pending payout (420.00) paid 460 for one job and took
 * 40 back from another; the paid one (860.00) paid three, one of them after the
 * failed one (120.00) didn't reach the workshop.
 */
function northcastJobs(): Job[] {
  const job = (
    n: number,
    name: string,
    quantity: number,
    fields: Pick<Job, "state" | "holding" | "amount" | "paid"> & Partial<Pick<Job, "order" | "customerPaid" | "overrideReason">>,
    group = groupId(n),
  ): Job => ({
    id: jobId(n),
    groupId: group,
    name,
    quantity,
    order: null,
    customerPaid: null,
    overrideReason: null,
    ...fields,
  });
  const fillers = Array.from({ length: 17 }, (_, index) =>
    job(index + 1, `Bracket batch ${index + 1}`, 4, { state: "owed", holding: "with_you", amount: 6000, paid: 6000 }),
  );
  return [
    job(25, "Ring band", 6, { state: "not_yet", holding: "with_you", amount: 18000, paid: 0 }, RING_BAND_JOB_ID),
    job(24, "Pendant", 4, { state: "not_yet", holding: "with_you", amount: 12000, paid: 12000 }),
    job(23, "Signet ring", 2, { state: "not_yet", holding: "with_you", amount: 8000, paid: 0 }),
    job(22, "Cufflinks", 8, { state: "owed", holding: "taken_back", amount: 0, paid: 0 }),
    job(21, "Bangle", 12, { state: "owed", holding: "with_you", amount: 90000, paid: 0, order: orderOf(1042, 1), customerPaid: true }),
    job(20, "Ear cuff", 20, { state: "owed", holding: "with_you", amount: 46000, paid: 0, order: orderOf(1041, 0), customerPaid: false, overrideReason: "Agreed rush surcharge" }),
    job(19, "Charm", 10, { state: "owed", holding: "with_you", amount: 46000, paid: 46000, order: orderOf(1042, 0), customerPaid: true }),
    job(18, "Tie pin", 5, { state: "owed", holding: "cancelled", amount: 8000, paid: 8000 }),
    ...fillers.reverse(),
  ];
}

function northcastPayouts(now: number): Payout[] {
  return [
    { id: PENDING_PAYOUT_ID, partnerId: NORTHCAST_ID, amount: 42000, status: "pending", failure: null, createdAt: now - DAY_MS, settledAt: null, jobs: [{ jobId: jobId(19), amount: 46000 }, { jobId: jobId(18), amount: -4000 }] },
    { id: PAID_PAYOUT_ID, partnerId: NORTHCAST_ID, amount: 86000, status: "paid", failure: null, createdAt: now - 4 * DAY_MS, settledAt: now - 3 * DAY_MS, jobs: [{ jobId: jobId(1), amount: 30000 }, { jobId: jobId(2), amount: 44000 }, { jobId: jobId(3), amount: 12000 }] },
    { id: FAILED_PAYOUT_ID, partnerId: NORTHCAST_ID, amount: 12000, status: "failed", failure: "The partner's bank refused the transfer", createdAt: now - 10 * DAY_MS, settledAt: now - 10 * DAY_MS, jobs: [{ jobId: jobId(3), amount: 12000 }] },
  ];
}

/** Offset cursors, as the fake's other lists page. */
export function page<T>(all: T[], params: URLSearchParams): Answer<Page<T>> {
  const limit = Number(params.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { ok: false, status: 400, errors: [{ path: "limit", message: "must be 1 to 100" }] };
  const offset = Number(params.get("cursor") ?? 0);
  if (!Number.isInteger(offset) || offset < 0) return { ok: false, status: 400, errors: [{ path: "cursor", message: "Invalid cursor" }] };
  return { ok: true, body: { data: all.slice(offset, offset + limit), next_cursor: offset + limit < all.length ? String(offset + limit) : null } };
}

export function createEarningsStore(now: () => number) {
  const jobs = new Map<string, Job[]>([[NORTHCAST_ID, northcastJobs()], [LAYERLINE_ID, []]]);
  const payouts: Payout[] = northcastPayouts(now());
  const accounts = new Map<string, PayoutAccountState>([[NORTHCAST_ID, "not_connected"], [LAYERLINE_ID, "ready"]]);
  const noKeys = new Set<string>();
  const payKeys = new Map<string, Payout>();

  const jobsOf = (partnerId: string) => jobs.get(partnerId) ?? [];
  /** Owed now less what payouts hold: a taken back or cancelled job is owed its amount at once. */
  const dueOf = (job: Job) => (job.state === "owed" ? job.amount : 0) - job.paid;

  function owedJob(job: Job): OwedJob {
    return {
      assignment_id: job.id,
      group_id: job.groupId,
      product: job.name === null ? null : { name: job.name },
      quantity: job.quantity,
      state: job.state,
      holding: job.holding,
      amount: money(job.amount),
      paid: money(job.paid),
      due: money(dueOf(job)),
    };
  }

  function payoutView(payout: Payout): PartnerPayout {
    const all = jobsOf(payout.partnerId);
    return {
      id: payout.id,
      partner_id: payout.partnerId,
      amount: money(payout.amount),
      currency: CURRENCY,
      status: payout.status,
      created_at: new Date(payout.createdAt).toISOString(),
      settled_at: payout.settledAt === null ? null : new Date(payout.settledAt).toISOString(),
      jobs: payout.jobs.map(({ jobId: id, amount }) => {
        const job = all.find((candidate) => candidate.id === id)!;
        return { assignment_id: job.id, group_id: job.groupId, product: job.name === null ? null : { name: job.name }, quantity: job.quantity, amount: money(amount) };
      }),
    };
  }

  /** What staff read of a job on top of the partner's: its order, why staff set the amount, and whether the customer paid. */
  function staffOwedJob(job: Job): StaffOwedJob {
    return { ...owedJob(job), order: job.order, override_reason: job.overrideReason, customer_paid: job.customerPaid };
  }

  /** What staff read of a payout on top of the partner's: the provider's words, and each job's order. */
  function staffPayoutView(payout: Payout): StaffPayout {
    const view = payoutView(payout);
    const all = jobsOf(payout.partnerId);
    return {
      ...view,
      failure: payout.failure,
      jobs: view.jobs.map((line) => ({ ...line, order: all.find((job) => job.id === line.assignment_id)!.order })),
    };
  }

  const totals = (partnerId: string) => {
    const all = jobsOf(partnerId);
    const notYet = all.filter((job) => job.state === "not_yet");
    return {
      due_total: money(all.reduce((sum, job) => sum + dueOf(job), 0)),
      not_yet_total: money(notYet.reduce((sum, job) => sum + job.amount, 0)),
      not_yet_count: notYet.length,
      currency: CURRENCY,
    };
  };

  return {
    /** `GET .../owed`: the totals cover every page. */
    owed(partnerId: string, params: URLSearchParams): Answer<PartnerOwed> {
      const answer = page(jobsOf(partnerId), params);
      if (!answer.ok) return answer;
      return { ok: true, body: { ...totals(partnerId), jobs: answer.body.data.map(owedJob), next_cursor: answer.body.next_cursor } };
    },

    /** `GET /partners/{id}/owed` (`jobs.controller.ts:148`): the same, with the staff fields on each job. */
    staffOwed(partnerId: string, params: URLSearchParams): Answer<StaffPartnerOwed> {
      const answer = page(jobsOf(partnerId), params);
      if (!answer.ok) return answer;
      return { ok: true, body: { ...totals(partnerId), jobs: answer.body.data.map(staffOwedJob), next_cursor: answer.body.next_cursor } };
    },

    /** `GET /partners/{id}/payouts`, newest first, with the staff fields. */
    staffPayouts(partnerId: string, params: URLSearchParams): Answer<Page<StaffPayout>> {
      const answer = page(payouts.filter((payout) => payout.partnerId === partnerId), params);
      return answer.ok ? { ok: true, body: { data: answer.body.data.map(staffPayoutView), next_cursor: answer.body.next_cursor } } : answer;
    },

    /**
     * `POST /partners/{id}/payouts` (`payouts.controller.ts:31`): pays everything due now as one pending
     * payout. The same key replays the same payout, so a double click pays once.
     */
    pay(partnerId: string, key: string | null): Answer<StaffPayout> {
      const seen = key ? payKeys.get(`${partnerId}:${key}`) : undefined;
      if (seen) return { ok: true, body: staffPayoutView(seen) };
      if ((accounts.get(partnerId) ?? "not_connected") !== "ready")
        return { ok: false, status: 409, code: "payout_account_not_ready", detail: "The partner's payout account isn't ready" };
      const owing = jobsOf(partnerId).filter((job) => dueOf(job) !== 0);
      const amount = owing.reduce((sum, job) => sum + dueOf(job), 0);
      if (amount <= 0) return { ok: false, status: 409, code: "nothing_due", detail: "There's nothing to pay" };
      const payout: Payout = {
        id: payoutId(100 + payouts.length),
        partnerId,
        amount,
        status: "pending",
        failure: null,
        createdAt: now(),
        settledAt: null,
        jobs: owing.map((job) => ({ jobId: job.id, amount: dueOf(job) })),
      };
      for (const job of owing) job.paid += dueOf(job);
      payouts.unshift(payout);
      if (key) payKeys.set(`${partnerId}:${key}`, payout);
      return { ok: true, body: staffPayoutView(payout) };
    },

    /** `GET .../payouts`, newest first. */
    payouts(partnerId: string, params: URLSearchParams): Answer<Page<PartnerPayout>> {
      const answer = page(payouts.filter((payout) => payout.partnerId === partnerId), params);
      return answer.ok ? { ok: true, body: { data: answer.body.data.map(payoutView), next_cursor: answer.body.next_cursor } } : answer;
    },

    account(partnerId: string): { state: PayoutAccountState } {
      return { state: accounts.get(partnerId) ?? "not_connected" };
    },

    /** `POST .../payout-account/link`: the first link starts the account at the provider. */
    link(partnerId: string, origin: string): Answer<{ url: string; expires_at: string }> {
      if (noKeys.has(partnerId)) return { ok: false, status: 409, detail: "The workspace has no payment keys" };
      if ((accounts.get(partnerId) ?? "not_connected") === "not_connected") accounts.set(partnerId, "onboarding");
      return { ok: true, body: { url: `${origin}/fake-provider/onboarding?partner=${partnerId}`, expires_at: new Date(now() + LINK_MS).toISOString() } };
    },

    /** Test control: the provider's word on the account, as its webhook brings it. */
    setAccount(partnerId: string, state: PayoutAccountState): void {
      accounts.set(partnerId, state);
    },

    /** Test control: the workspace has no payment keys, so the link is a 409. */
    linkUnavailable(partnerId: string): void {
      noKeys.add(partnerId);
    },

    /**
     * Test control: the provider settles the partner's pending payout; a failed one keeps the provider's
     * words (`failure`, staff only) and gives its jobs back to be paid.
     */
    settlePending(partnerId: string, status: "paid" | "failed", failure?: string): void {
      const payout = payouts.find((candidate) => candidate.partnerId === partnerId && candidate.status === "pending");
      if (!payout) return;
      payout.status = status;
      payout.settledAt = now();
      if (status === "paid") return;
      payout.failure = failure ?? null;
      for (const line of payout.jobs) {
        const job = jobsOf(partnerId).find((candidate) => candidate.id === line.jobId)!;
        job.paid -= line.amount;
      }
    },
  };
}
