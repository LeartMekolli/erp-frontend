/**
 * The fake erp-api's in-app notifications (erp-api
 * `src/modules/notifications/feed.controller.ts`): each person reads only
 * their own, newest first, and marking one read keeps its first read time.
 */

import type { FeedEntry } from "../../src/lib/api/schema-types";

import { PAID_PAYOUT_ID } from "./earnings";
import type { Answer, Page } from "./orders";
import { PENDANT_OFFER_ID, RING_OFFER_ID } from "./partner-jobs";
import { NORTHCAST_ID, PARTNER, STAFF } from "./seed";

interface StoredEntry {
  userId: string;
  entry: FeedEntry;
}

const uuid = (n: number) => `55555555-0000-4000-8000-${String(n).padStart(12, "0")}`;
const orderId = (number: number) => `22222222-0000-4000-8000-${String(number).padStart(12, "0")}`;

/** What happened, newest first; the first three are unread. */
const EVENTS: Pick<FeedEntry, "event_key" | "subject" | "title" | "body">[] = [
  { event_key: "order.late", subject: { type: "order", id: orderId(1041) }, title: "Order #1041 is 2 days late", body: "Fieldnote Studio was promised it two days ago. Its brackets are still in production." },
  { event_key: "tenant.ai_budget", subject: { type: "tenant", id: "8d3a6a1e-4f5b-4c2d-9a7e-1b2c3d4e5f60" }, title: "AI use is at 80%", body: "Your workspace has used 80% of this month's AI allowance." },
  { event_key: "customer.created", subject: { type: "customer", id: "11111111-0000-4000-8000-000000000009" }, title: "New customer: Brightline Optics", body: "Brightline Optics signed up through your storefront." },
];

const FILLER: Pick<FeedEntry, "event_key" | "subject" | "title" | "body">[] = [
  { event_key: "order.ready", subject: { type: "order", id: orderId(1042) }, title: "Order #1042 is ready to ship", body: "Every line of Luna Jewels' order is ready." },
  { event_key: "job.accepted", subject: { type: "job_assignment", id: uuid(900) }, title: "Northcast Foundry accepted a job", body: "Brackets for order #1041." },
  { event_key: "partner.capacity_changed", subject: { type: "partner", id: "2f1c5d7e-0a9b-4e3c-8d2f-6a5b4c3d2e10" }, title: "Northcast Foundry updated its capacity", body: "They can take 20 more jobs this week." },
];

/** The two offers waiting for Northcast's owner (`jobs.service.ts:199`): both unread, each naming its job. */
function partnerEntries(now: number): StoredEntry[] {
  const offered = (n: number, groupId: string, title: string, body: string, hoursAgo: number): StoredEntry => ({
    userId: PARTNER.id,
    entry: {
      id: uuid(n),
      event_key: "partner.job.offered",
      subject: { type: "job_assignment", id: uuid(n + 100) },
      title,
      body,
      job: { id: groupId, partner_id: NORTHCAST_ID },
      payout: null,
      created_at: new Date(now - hoursAgo * 3_600_000).toISOString(),
      read_at: null,
    },
  });
  const paidAt = new Date(now - 72 * 3_600_000).toISOString();
  // `payout.paid` (erp-api `payouts.service.ts:151`): read already, naming the payout and its workshop.
  const paid: StoredEntry = {
    userId: PARTNER.id,
    entry: {
      // Older than both offers, so below their ids: the next page is everything below the cursor's id.
      id: uuid(0),
      event_key: "payout.paid",
      subject: { type: "payout", id: PAID_PAYOUT_ID },
      title: "You have been paid 860.00 EUR",
      body: "We have sent you 860.00 EUR for 3 jobs. It reaches your account on the payment provider’s schedule.",
      job: null,
      payout: { id: PAID_PAYOUT_ID, partner_id: NORTHCAST_ID },
      created_at: paidAt,
      read_at: paidAt,
    },
  };
  return [
    offered(32, RING_OFFER_ID, "New job offered: Ring", "10 pieces, answer within 5 hours.", 1),
    offered(31, PENDANT_OFFER_ID, "New job offered: Pendant", "3 pieces, answer within 90 minutes.", 2),
    paid,
  ];
}

function seedEntries(now: number): StoredEntry[] {
  return [...partnerEntries(now), ...staffEntries(now)];
}

/** Thirty entries for the main staff account, an hour apart before `now`. */
function staffEntries(now: number): StoredEntry[] {
  return Array.from({ length: 30 }, (_, index) => {
    const event = EVENTS[index] ?? FILLER[index % FILLER.length]!;
    const createdAt = new Date(now - (index + 1) * 3_600_000).toISOString();
    return {
      userId: STAFF.id,
      entry: { id: uuid(30 - index), ...structuredClone(event), job: null, payout: null, created_at: createdAt, read_at: index < EVENTS.length ? null : createdAt },
    };
  });
}

export function createNotificationsStore(now: () => number) {
  const entries = seedEntries(now());

  return {
    list(userId: string, params: URLSearchParams): Answer<Page<FeedEntry>> {
      const limit = Number(params.get("limit") ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        return { ok: false, status: 400, errors: [{ path: "limit", message: "must be 1 to 200" }] };
      const unread = params.get("unread") === "true";
      const cursor = params.get("cursor");
      // Ids grow with time, so the next page is everything older than the cursor's entry.
      const own = entries
        .filter((e) => e.userId === userId && (!unread || e.entry.read_at === null))
        .filter((e) => cursor === null || e.entry.id < cursor)
        .map((e) => structuredClone(e.entry));
      const data = own.slice(0, limit);
      return { ok: true, body: { data, next_cursor: own.length > limit ? data.at(-1)!.id : null } };
    },

    /** 404 for another person's entry, as for one that doesn't exist. */
    markRead(userId: string, id: string): Answer<null> {
      const found = entries.find((e) => e.userId === userId && e.entry.id === id);
      if (!found) return { ok: false, status: 404, detail: "Notification not found" };
      found.entry.read_at ??= new Date(now()).toISOString();
      return { ok: true, body: null };
    },

    /** Entries read before keep their first read time. */
    readAll(userId: string): void {
      const readAt = new Date(now()).toISOString();
      for (const e of entries) if (e.userId === userId) e.entry.read_at ??= readAt;
    },

    unread(userId: string): number {
      return entries.filter((e) => e.userId === userId && e.entry.read_at === null).length;
    },
  };
}
