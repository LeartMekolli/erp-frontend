/**
 * The fake erp-api's dashboard numbers (erp-api `src/modules/reporting/`: `dashboard.controller.ts`,
 * `range-buckets.ts`, `range-metrics.ts`, `week-metrics.ts`, `series.ts`, `attention.service.ts`).
 *
 * 400 days of orders are made up from a day's position in the run, with a weekday rhythm: no
 * `Math.random`, so a test always reads the same numbers. Everything is kept per day in integer
 * cents and counts; a week, a range and each bucket of a series add days up, and money is written
 * as a string only on the way out. What a reader may see is cut in one place per shape, as erp-api
 * cuts it: a figure the reader may not see is left out, never zeroed.
 */

import type { AttentionGroup, DashboardRange, DashboardResponse, Order, Permission, RangeSeriesPoint } from "../../src/lib/api/schema-types";

import type { Answer } from "./orders";
import { CUSTOMERS as ORDER_CUSTOMERS, uuid } from "./orders-seed";
import { LAYERLINE_ID, LUNA_ID, MIRA_ID, NORTHCAST_ID } from "./seed";

const CURRENCY = "EUR";
const DAY_MS = 24 * 3_600_000;
/** How many days of orders there are, ending today. */
export const SEEDED_DAYS = 400;
/** A Monday long ago. A day's figures come from its distance to this date, so a date always has the same numbers. */
const EPOCH = "2000-01-03";
/** erp-api's `MAX_RANGE_DAYS`. */
const MAX_RANGE_DAYS = 366;
/** The on-time rate the workspace aims for (0 to 1). */
const ON_TIME_TARGET = 0.95;
/** A briefing can be written again this long after the last (erp-api `briefings` refuse sooner with a 409). */
const BRIEFING_COOLDOWN_MS = 15 * 60_000;
const DISMISS_DAYS = 14;

type RangeMetrics = DashboardRange["current"];
type WeekMetrics = DashboardResponse["current"];
type PointNumbers = RangeSeriesPoint["previous"];
type AiOn = Extract<NonNullable<DashboardResponse["ai"]>, { enabled: true }>;
type Briefing = NonNullable<AiOn["briefing"]>;
type Suggestion = Briefing["suggestions"][number];
type Dismissal = AiOn["dismissed"][number];

/** What a reader's permissions let them see of the numbers. */
interface Reader {
  money: boolean;
  partners: boolean;
}

const readerOf = (permissions: readonly Permission[]): Reader => ({
  money: permissions.includes("payment.read"),
  partners: permissions.includes("partner.read"),
});

// ---- calendar days (`YYYY-MM-DD`, no time zone) ----

const utc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const addDays = (date: string, days: number) => new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS);
/** How many days the range holds, both ends included. */
const spanDays = (from: string, to: string) => daysBetween(from, to) + 1;
const weekdayOf = (date: string) => new Date(utc(date)).getUTCDay();
const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));
const nextMonthStart = (date: string) => {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
};
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(utc(value)).toISOString().slice(0, 10) === value;

// ---- what is made up ----

const PRODUCTS = [
  { id: uuid("e2e2e2e2", 1), name: "Ring band", share: 50 },
  { id: uuid("e2e2e2e2", 2), name: "Pendant", share: 30 },
  { id: uuid("e2e2e2e2", 3), name: "Cufflinks", share: 20 },
];
const GROUPS = [
  { id: uuid("e4e4e4e4", 1), key: "retail", name: "Retail", share: 60 },
  { id: uuid("e4e4e4e4", 2), key: "trade", name: "Trade", share: 40 },
];
const DEFECTS = [
  { id: uuid("e3e3e3e3", 1), key: "porosity", name: "Porosity" },
  { id: uuid("e3e3e3e3", 2), key: "scratch", name: "Scratch" },
  { id: uuid("e3e3e3e3", 3), key: "crack", name: "Crack" },
];
/** `hours` is a step's median in a range, `hoursBefore` in the range before it: Casting got slower, Plating faster. */
const STEPS = [
  { id: uuid("e1e1e1e1", 1), name: "Print", hours: 6, hoursBefore: 6, inHouse: 14, atPartner: 6, late: 1 },
  { id: uuid("e1e1e1e1", 2), name: "Cure", hours: 3, hoursBefore: 3, inHouse: 9, atPartner: 0, late: 0 },
  { id: uuid("e1e1e1e1", 3), name: "Finish", hours: 5, hoursBefore: 4, inHouse: 11, atPartner: 3, late: 2 },
  { id: uuid("e1e1e1e1", 4), name: "Packing", hours: 2, hoursBefore: 2, inHouse: 5, atPartner: 0, late: 0 },
  { id: uuid("e1e1e1e1", 5), name: "Casting tree", hours: 4, hoursBefore: 4, inHouse: 4, atPartner: 7, late: 0 },
  { id: uuid("e1e1e1e1", 6), name: "Casting", hours: 22, hoursBefore: 17, inHouse: 0, atPartner: 12, late: 3 },
  { id: uuid("e1e1e1e1", 7), name: "Polishing", hours: 7, hoursBefore: 7, inHouse: 6, atPartner: 5, late: 1 },
  { id: uuid("e1e1e1e1", 8), name: "Plating", hours: 11, hoursBefore: 13, inHouse: 0, atPartner: 8, late: 0 },
  { id: uuid("e1e1e1e1", 9), name: "Final QC", hours: 2, hoursBefore: 2, inHouse: 7, atPartner: 0, late: 1 },
];

type Period = "current" | "previous";
const CUSTOMERS = [
  { id: LUNA_ID, name: "Luna Jewels", share: 60 },
  { id: MIRA_ID, name: "Mira Studio", share: 40 },
];
const PARTNERS = [
  { id: NORTHCAST_ID, name: "Northcast Foundry", percent: 72, onTime: 0.94 },
  { id: LAYERLINE_ID, name: "Layerline Prints", percent: 41, onTime: 0.97 },
];

/** `total` shared out by percentages that add up to 100; the last share takes what rounding left. */
function split(total: number, shares: readonly number[]): number[] {
  const parts = shares.map((share) => Math.floor((total * share) / 100));
  parts[parts.length - 1]! += total - parts.reduce((sum, part) => sum + part, 0);
  return parts;
}

/** One day's figures: counts and cents. */
interface Day {
  placed: number;
  revenue: number;
  onTime: number;
  pieces: number;
  defects: number[];
  partnerCost: number;
  newCustomers: number;
}

const NO_DAY: Day = { placed: 0, revenue: 0, onTime: 0, pieces: 0, defects: [0, 0, 0], partnerCost: 0, newCustomers: 0 };

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const money = (cents: number) => (cents / 100).toFixed(2);
const rate = (part: number, whole: number) => (whole === 0 ? null : round4(part / whole));

export function createReportsStore(now: () => number, orders: () => Order[] = () => []) {
  const todayOf = () => new Date(now()).toISOString().slice(0, 10);

  /**
   * The figures of a day: fewer orders at weekends. They depend on the date alone; `today` only bounds
   * the run (400 days ending today), so a date never changes its numbers when the clock moves on.
   */
  function dayAt(date: string, today: string): Day {
    if (date > today || date < addDays(today, -(SEEDED_DAYS - 1))) return NO_DAY;
    const i = daysBetween(EPOCH, date);
    const weekend = [0, 6].includes(weekdayOf(date));
    const placed = weekend ? 1 + (i % 3) : 6 + ((i * 7) % 5);
    const revenue = placed * (21_000 + ((i * 37) % 9) * 1_500);
    return {
      placed,
      revenue,
      onTime: placed - (i % 7 === 3 ? 1 : 0),
      pieces: placed * 3,
      defects: [i % 3 === 0 ? 1 : 0, i % 4 === 1 ? 1 : 0, i % 11 === 2 ? 1 : 0],
      partnerCost: Math.floor((revenue * 35) / 100),
      newCustomers: i % 6 === 0 ? 1 : 0,
    };
  }

  /** The days from `from` to `to` added up. */
  function sum(from: string, to: string, today: string): Day {
    const total: Day = { ...NO_DAY, defects: [0, 0, 0] };
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const day = dayAt(date, today);
      total.placed += day.placed;
      total.revenue += day.revenue;
      total.onTime += day.onTime;
      total.pieces += day.pieces;
      total.partnerCost += day.partnerCost;
      total.newCustomers += day.newCustomers;
      total.defects = total.defects.map((count, index) => count + day.defects[index]!);
    }
    return total;
  }

  /** The reader week (`week-metrics.ts` `forReader`): what the dashboard shows of a week, cut to what the reader may see. */
  function weekMetrics(total: Day, reader: Reader, to: string, period: Period): WeekMetrics {
    const any = total.placed > 0;
    const customerRevenue = split(total.revenue, CUSTOMERS.map((customer) => customer.share));
    const defectCount = total.defects.reduce((sum, count) => sum + count, 0);
    return {
      currency: CURRENCY,
      orders: reader.money
        ? { placed: total.placed, revenue: money(total.revenue), average_value: any ? money(Math.round(total.revenue / total.placed)) : null }
        : { placed: total.placed },
      production: {
        on_time_rate: rate(total.onTime, total.placed),
        step_hours: any
          ? STEPS.map((step) => ({ step_type_id: step.id, name: step.name, median_hours: period === "current" ? step.hours : step.hoursBefore }))
          : [],
        defect_rate: rate(defectCount, total.pieces),
        claims: Math.floor(total.placed / 60),
        remakes: Math.floor(total.placed / 90),
      },
      customers: {
        new: total.newCustomers,
        top: any
          ? CUSTOMERS.map((customer, index) => ({
              id: customer.id,
              name: customer.name,
              ...(reader.money ? { revenue: money(customerRevenue[index]!) } : {}),
            }))
          : [],
        ordering_less: any ? [{ id: MIRA_ID, name: "Mira Studio", last_order_on: addDays(to, -12) }] : [],
        ...(reader.money ? { slow_payers: any ? [{ id: ORDER_CUSTOMERS.pinewood.id, name: ORDER_CUSTOMERS.pinewood.name, overdue: "295.20" }] : [] } : {}),
      },
      ...(reader.partners
        ? { partners: { load: PARTNERS.map(({ id, name, percent }) => ({ id, name, percent })), on_time: PARTNERS.map(({ id, name, onTime }) => ({ id, name, rate: onTime })) } }
        : {}),
    };
  }

  /** A range's metrics (`range-metrics.ts` `forRangeReader`): the reader week plus the cuts only a range has. */
  function rangeMetrics(total: Day, reader: Reader, to: string, period: Period): RangeMetrics {
    const base = weekMetrics(total, reader, to, period);
    const productQuantity = split(total.placed * 2, PRODUCTS.map((product) => product.share));
    const productRevenue = split(total.revenue, PRODUCTS.map((product) => product.share));
    const groupRevenue = split(total.revenue, GROUPS.map((group) => group.share));
    return {
      ...base,
      orders: {
        ...base.orders,
        ...(reader.money
          ? {
              by_product: PRODUCTS.flatMap((product, index) =>
                productQuantity[index]! > 0
                  ? [{ product_id: product.id, name: product.name, quantity: productQuantity[index]!, revenue: money(productRevenue[index]!) }]
                  : [],
              ),
              by_customer_group: total.revenue > 0
                ? GROUPS.map((group, index) => ({ customer_group: { id: group.id, key: group.key, name: group.name }, revenue: money(groupRevenue[index]!) }))
                : [],
            }
          : {}),
      },
      production: {
        ...base.production,
        defects_by_kind: DEFECTS.flatMap((defect, index) => (total.defects[index]! > 0 ? [{ defect_id: defect.id, key: defect.key, name: defect.name, count: total.defects[index]! }] : [])).toSorted(
          (a, b) => b.count - a.count,
        ),
      },
      ...(base.partners
        ? { partners: { ...base.partners, ...(reader.money ? { cost: { amount: money(total.partnerCost), currency: CURRENCY } } : {}) } }
        : {}),
    };
  }

  /** One point of a series (`series.ts` `pointOf`): money needs `payment.read`, partner cost both that and `partner.read`. */
  function pointOf(total: Day, reader: Reader): PointNumbers {
    return {
      orders_placed: total.placed,
      ...(reader.money ? { revenue: money(total.revenue), average_value: total.placed > 0 ? money(Math.round(total.revenue / total.placed)) : null } : {}),
      on_time_rate: rate(total.onTime, total.placed),
      defect_rate: rate(
        total.defects.reduce((sum, count) => sum + count, 0),
        total.pieces,
      ),
      ...(reader.money && reader.partners ? { partner_cost: money(total.partnerCost) } : {}),
    };
  }

  /** The buckets of a range (`range-buckets.ts`): days, ISO weeks or calendar months, the first and last clipped to the range. */
  function bucketsOf(from: string, to: string, bucket: "day" | "week" | "month"): { start: string; end: string }[] {
    const buckets: { start: string; end: string }[] = [];
    for (let start = from; start <= to; ) {
      const natural = bucket === "day" ? start : bucket === "week" ? addDays(mondayOf(start), 6) : addDays(nextMonthStart(start), -1);
      const end = natural < to ? natural : to;
      buckets.push({ start, end });
      start = addDays(end, 1);
    }
    return buckets;
  }

  // ---- the briefing ----

  const SUGGESTIONS: Suggestion[] = [
    {
      id: uuid("e5e5e5e5", 1),
      kind: "offer_job",
      targets: [{ type: "order", id: uuid("22222222", 1041), label: "#1041" }],
      reason: "Order #1041 is 2 days late and no workshop has taken its job.",
    },
    {
      id: uuid("e5e5e5e5", 2),
      kind: "chase_invoice",
      targets: [{ type: "customer", id: ORDER_CUSTOMERS.pinewood.id, label: ORDER_CUSTOMERS.pinewood.name }],
      reason: "Pinewood Instruments has an invoice 5 days overdue.",
    },
    {
      id: uuid("e5e5e5e5", 3),
      kind: "review_step",
      targets: [{ type: "step", id: STEPS[8]!.id, label: "Final QC" }],
      reason: "Final QC failed more pieces this week than last.",
    },
  ];

  let aiOff: "not_set_up" | "limit_used" | null = null;
  /** When the latest briefing was written. */
  let writtenAt = now() - 2 * 3_600_000;
  /** The dismissals of the last 14 days, newest first, each with the suggestion it hides. */
  let dismissals: { suggestionId: string; view: Dismissal }[] = [];
  /** A new briefing is pending on the first read after it was asked for, and written on the next. */
  let writing: 0 | 1 | 2 = 0;
  const briefingKeys = new Map<string, { id: string }>();

  /** The latest briefing: its suggestions in their original order, less the dismissed ones (`briefing.service.ts:167-178`). */
  const briefingNow = (): Briefing => ({
    summary: "Orders are steady and on-time delivery is close to the target. Pinewood Instruments needs a nudge on an overdue invoice.",
    created_at: new Date(writtenAt).toISOString(),
    suggestions: structuredClone(SUGGESTIONS).filter((suggestion) => !dismissals.some((one) => one.suggestionId === suggestion.id)),
  });

  function aiSection(): NonNullable<DashboardResponse["ai"]> {
    if (aiOff) return { enabled: false, reason: aiOff };
    if (writing === 2) {
      writtenAt = now();
      writing = 0;
    }
    const pending = writing === 1;
    if (pending) writing = 2;
    return { enabled: true, briefing: briefingNow(), pending, dismissed: dismissals.map((one) => one.view) };
  }

  // ---- attention ----

  /**
   * What needs attention, read from the orders store's own rows. Each kind follows the permission of the
   * list it comes from (`attention.service.ts:33-43`), has at most 20 items (`MAX_ITEMS`) and is left out
   * when nothing is in it.
   */
  function attentionFor(permissions: readonly Permission[]): AttentionGroup[] {
    const all = orders();
    const label = (order: Order) => `#${order.number} · ${order.customer.name}`;
    const day = (date: string) => `${date}T00:00:00.000Z`;
    const groups: { kind: AttentionGroup["kind"]; permission: Permission; items: AttentionGroup["items"] }[] = [
      {
        kind: "order_at_risk",
        permission: "order.read",
        items: all.filter((order) => order.needs.includes("late")).map((order) => ({ ref: { type: "order", id: order.id }, label: label(order), since: day(order.promised_on) })),
      },
      {
        // A late order's lines that have pieces being made.
        kind: "job_overdue",
        permission: "order.read",
        items: all
          .filter((order) => order.needs.includes("late"))
          .flatMap((order) =>
            order.lines.flatMap((line) => (line.group_id ? [{ ref: { type: "job" as const, id: line.group_id }, label: `${line.product.name} · #${order.number}`, since: day(order.promised_on) }] : [])),
          ),
      },
      {
        kind: "awaiting_payment",
        permission: "payment.read",
        items: all.filter((order) => order.payment.state === "awaiting_payment").map((order) => ({ ref: { type: "order", id: order.id }, label: label(order), since: order.placed_at })),
      },
      {
        kind: "invoice_overdue",
        permission: "payment.read",
        items: all.filter((order) => order.payment.state === "overdue").map((order) => ({ ref: { type: "order", id: order.id }, label: `${label(order)} · ${order.total} ${order.currency}`, since: order.payment.invoice?.due_on ? day(order.payment.invoice.due_on) : null })),
      },
      {
        kind: "offer_unanswered",
        permission: "partner.read",
        items: all.flatMap((order) =>
          order.lines.flatMap((line) =>
            line.partner?.status === "offered" ? [{ ref: { type: "partner" as const, id: line.partner.id }, label: `${line.partner.name} · ${line.product.name} · #${order.number}`, since: order.placed_at }] : [],
          ),
        ),
      },
      {
        kind: "defect_spike",
        permission: "workflow.read",
        items: [{ ref: { type: "step", id: STEPS[8]!.id }, label: "Final QC · 4 defects this week", since: null }],
      },
    ];
    return groups
      .filter((group) => permissions.includes(group.permission) && group.items.length > 0)
      .map(({ kind, items }) => ({ kind, total: items.length, items: items.slice(0, 20) }));
  }

  const invalid = (path: string, message: string): Answer<never> => ({ ok: false, status: 400, errors: [{ path, message }] });

  return {
    /** `GET /reports/dashboard` (`dashboard.controller.ts:45-52`): `production` needs `workflow.read`, `ai` all of report, payment and partner reads. */
    dashboard(permissions: readonly Permission[]): DashboardResponse {
      const reader = readerOf(permissions);
      const today = todayOf();
      const start = mondayOf(today);
      const previousStart = addDays(start, -7);
      const canSeeAi = reader.money && reader.partners;
      return {
        week: { start, previous_start: previousStart, computed_at: new Date(now()).toISOString() },
        current: weekMetrics(sum(start, addDays(start, 6), today), reader, addDays(start, 6), "current"),
        previous: weekMetrics(sum(previousStart, addDays(previousStart, 6), today), reader, addDays(previousStart, 6), "previous"),
        attention: attentionFor(permissions),
        ...(permissions.includes("workflow.read")
          ? { production: { wip: STEPS.map((step) => ({ step_type_id: step.id, name: step.name, in_house: step.inHouse, at_partner: step.atPartner, late: step.late })) } }
          : {}),
        ...(canSeeAi ? { ai: aiSection() } : {}),
      };
    },

    /** `GET /reports/range` (`range-buckets.ts:22-25`): both ends included, at most 366 days, `bucket` only `day`. */
    range(params: URLSearchParams, permissions: readonly Permission[]): Answer<DashboardRange> {
      const extra = [...params.keys()].find((key) => !["from", "to", "bucket"].includes(key));
      if (extra) return invalid(extra, `Unrecognized key: "${extra}"`);
      const from = params.get("from");
      const to = params.get("to");
      if (from === null) return invalid("from", "Invalid input: expected string, received undefined");
      if (to === null) return invalid("to", "Invalid input: expected string, received undefined");
      if (!isDate(from)) return invalid("from", "Invalid ISO date");
      if (!isDate(to)) return invalid("to", "Invalid ISO date");
      const bucketParam = params.get("bucket");
      if (bucketParam !== null && bucketParam !== "day") return invalid("bucket", 'Invalid input: expected "day"');
      const forced: "day" | null = bucketParam === "day" ? "day" : null;
      if (to < from) return invalid("to", "`to` is before `from`");
      const days = spanDays(from, to);
      if (days > MAX_RANGE_DAYS) return invalid("to", `At most ${MAX_RANGE_DAYS} days`);

      const reader = readerOf(permissions);
      // Read once, so one response never mixes two days' runs.
      const today = todayOf();
      const bucket = forced ?? (days <= 31 ? "day" : days <= 183 ? "week" : "month");
      const previousFrom = addDays(from, -days);
      const previousTo = addDays(from, -1);
      return {
        ok: true,
        body: {
          range: { from, to, previous_from: previousFrom, previous_to: previousTo, bucket },
          current: rangeMetrics(sum(from, to, today), reader, to, "current"),
          previous: rangeMetrics(sum(previousFrom, previousTo, today), reader, previousTo, "previous"),
          series: bucketsOf(from, to, bucket).map(({ start, end }) => ({
            ...pointOf(sum(start, end, today), reader),
            start,
            days: spanDays(start, end),
            // The same days of the period before: every day moved back by the length of the range.
            previous: pointOf(sum(addDays(start, -days), addDays(end, -days), today), reader),
          })),
          on_time_target: ON_TIME_TARGET,
          computed_at: new Date(now()).toISOString(),
        },
      };
    },

    /**
     * `POST /reports/dashboard/briefing` (`dashboard.controller.ts:91-97`): 202, then the dashboard reads
     * `ai.pending` once and the new briefing after. 409 within 15 minutes of the last, or with AI off.
     * The same key replays the same run.
     */
    writeBriefing(key: string | null): Answer<{ id: string }> {
      const seen = key ? briefingKeys.get(key) : undefined;
      if (seen) return { ok: true, body: seen };
      if (aiOff) return { ok: false, status: 409, detail: aiOff === "limit_used" ? "The AI limit for this month is used" : "AI is not set up for this workspace" };
      if (writing !== 0 || now() - writtenAt < BRIEFING_COOLDOWN_MS)
        return { ok: false, status: 409, detail: "A briefing was written less than 15 minutes ago" };
      writing = 1;
      const run = { id: crypto.randomUUID() };
      if (key) briefingKeys.set(key, run);
      return { ok: true, body: run };
    },

    /**
     * `POST /reports/dashboard/suggestions/{id}/dismiss` (`briefing.service.ts:131-143`): the suggestion goes for
     * 14 days, for the whole workspace. Dismissing one again, even though it is hidden, replaces its dismissal
     * and starts the 14 days over; only an unknown suggestion is a 404.
     */
    dismiss(id: string, by: { id: string; name: string }): Answer<null> {
      const suggestion = SUGGESTIONS.find((one) => one.id === id);
      if (!suggestion) return { ok: false, status: 404, detail: "Suggestion not found" };
      const at = now();
      const dismissalId = crypto.randomUUID();
      dismissals = [
        {
          suggestionId: id,
          view: {
            id: dismissalId,
            kind: suggestion.kind,
            targets: structuredClone(suggestion.targets),
            dismissed_by: by,
            dismissed_at: new Date(at).toISOString(),
            until: new Date(at + DISMISS_DAYS * DAY_MS).toISOString(),
          },
        },
        ...dismissals.filter((one) => one.suggestionId !== id),
      ];
      return { ok: true, body: null };
    },

    /** `DELETE /reports/dashboard/dismissals/{id}`: the suggestion shows again at once, where it was. */
    undoDismissal(id: string): Answer<null> {
      if (!dismissals.some((one) => one.view.id === id)) return { ok: false, status: 404, detail: "Dismissal not found" };
      dismissals = dismissals.filter((one) => one.view.id !== id);
      return { ok: true, body: null };
    },

    /** Test control: AI is off for the workspace, or on again. */
    setAiOff(reason: "not_set_up" | "limit_used" | null): void {
      aiOff = reason;
    },
  };
}

export type ReportsStore = ReturnType<typeof createReportsStore>;
