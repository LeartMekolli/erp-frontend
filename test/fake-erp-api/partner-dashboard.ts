/**
 * The fake erp-api's partner dashboard routes: the summary for a range
 * (`partner-jobs.controller.ts:58`, `partner-summary.service.ts`), the score and
 * ratings (`ratings.controller.ts:92`), the setup and the capacity history
 * (`setup.controller.ts`, `setup.service.ts:90-125`). Every figure is worked out
 * from the dates asked for, so any range gives the same answer every time.
 */

import type { CapacityRow, PartnerRole, PartnerScoreResponse, PartnerSetup, PartnerSummary } from "../../src/lib/api/schema-types";

import type { Answer } from "./orders";
import { uuid } from "./orders-seed";
import { LAYERLINE_ID, NORTHCAST_ID } from "./seed";

const DAY_MS = 24 * 3_600_000;
const CURRENCY = "EUR";
/** The longest range one read may cover (`range-buckets.ts`, `setup.service.ts:65`). */
const MAX_RANGE_DAYS = 366;
/** Day 0 of the fake's history, a Monday, so a day's figures don't depend on the range asked for. */
const EPOCH = "2000-01-03";
/** The day Northcast raised Casting from 45 to 50 a day. */
export const CASTING_RAISED_ON = "2026-11-05";

const utc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const addDays = (date: string, days: number) => new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
const spanDays = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS) + 1;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(utc(value)).toISOString().slice(0, 10) === value;
const money = (cents: number) => (cents / 100).toFixed(2);
const invalid = (path: string, message: string): Answer<never> => ({ ok: false, status: 400, errors: [{ path, message }] });

const step = (n: number, key: string, name: string) => ({ id: uuid("c9c9c9c9", n), key, name });

const PRINT_PATTERN = step(1, "print_pattern", "Print pattern");
const CASTING_TREE = step(2, "casting_tree", "Casting tree");
const CASTING = step(3, "casting", "Casting");
const POLISHING = step(4, "polishing", "Polishing");
const PLATING = step(5, "plating", "Plating");
const PRINT = step(6, "print", "Print");
const CURE = step(7, "cure", "Cure");
const FINISH = step(8, "finish", "Finish");

type Capability = PartnerSetup["capabilities"][number];
const capability = (stepType: ReturnType<typeof step>, capacity: number, period: "day" | "week" = "day"): Capability => ({
  step_type: stepType,
  min_quantity: 1,
  max_quantity: null,
  max_size_mm: null,
  capacity,
  capacity_period: period,
});

/** How many pieces wait at a step on day `i` of the history: a repeating pattern around the step's capacity. */
const LOADS: Record<string, (i: number) => number> = {
  print_pattern: (i) => 20 + ((i * 3) % 20),
  casting_tree: (i) => 15 + ((i * 5) % 15),
  // 40 to 54: over 45, and on some days over 50 too.
  casting: (i) => 40 + ((i * 7) % 15),
  polishing: (i) => 10 + (i % 8),
  plating: (i) => 60 + ((i * 11) % 50),
  print: (i) => 12 + ((i * 3) % 18),
  cure: (i) => 8 + ((i * 5) % 20),
  finish: (i) => 6 + (i % 10),
};

function seedSetups(): Map<string, PartnerSetup> {
  const setup = (partnerId: string, capabilities: Capability[], offerings: PartnerSetup["offerings"]): PartnerSetup => ({
    partner_id: partnerId,
    max_open_jobs: null,
    accepts_direct_orders: true,
    capabilities,
    closed_periods: [],
    offerings,
  });
  const material = (n: number, key: string, name: string) => ({ option_value_id: uuid("cacacaca", n), group_key: "material", key, name });
  return new Map([
    [
      NORTHCAST_ID,
      setup(
        NORTHCAST_ID,
        [capability(PRINT_PATTERN, 60), capability(CASTING_TREE, 40), capability(CASTING, 50), capability(POLISHING, 40), capability(PLATING, 200, "week")],
        [material(1, "silver_925", "Silver 925"), material(2, "gold_18k", "Gold 18k"), material(3, "brass", "Brass")],
      ),
    ],
    [LAYERLINE_ID, setup(LAYERLINE_ID, [capability(PRINT, 40), capability(CURE, 80), capability(FINISH, 30)], [])],
  ]);
}

/** Jobs finished in 30 days, now and the 30 days before; a range of another length scales them. */
const FINISHED: Record<string, [number, number]> = { [NORTHCAST_ID]: [14, 11], [LAYERLINE_ID]: [2, 1] };
/** Earned in 30 days, now and before, in cents. */
const EARNED: Record<string, [number, number]> = { [NORTHCAST_ID]: [1_164_000, 980_000], [LAYERLINE_ID]: [12_000, 6_000] };

/** Pieces at each step now; Northcast has some late. */
const STEPS_NOW: Record<string, PartnerSummary["steps"]> = {
  [NORTHCAST_ID]: [
    { key: "print_pattern", name: "Print pattern", on_track: 3, late: 0 },
    { key: "casting_tree", name: "Casting tree", on_track: 4, late: 0 },
    { key: "casting", name: "Casting", on_track: 7, late: 2 },
    { key: "polishing", name: "Polishing", on_track: 2, late: 1 },
    { key: "plating", name: "Plating", on_track: 1, late: 0 },
  ],
  [LAYERLINE_ID]: [{ key: "print", name: "Print", on_track: 4, late: 0 }],
};

/** Northcast's 50 newest ratings, newest first: mostly 5 and 4 stars, one comment staff shared. */
function northcastRatings(now: number): PartnerScoreResponse["ratings"] {
  const STARS = [5, 4, 5, 5, 3, 4, 5, 2, 4, 5];
  return Array.from({ length: 50 }, (_, n) => ({
    id: uuid("cbcbcbcb", n + 1),
    group_id: uuid("cccccccc", n + 1),
    stars: STARS[n % STARS.length]!,
    comment: n === 1 ? "Clean casting, the polish was even all round." : null,
    created_at: new Date(now - (n + 1) * 1.5 * DAY_MS).toISOString(),
  }));
}

/** Splits `from`..`to` into erp-api's buckets: a day each, weeks from Monday, or calendar months. */
function bucketsOf(from: string, to: string, bucket: "day" | "week" | "month"): { start: string; days: number }[] {
  const starts: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = new Date(utc(day)).getUTCDay();
    if (day === from || bucket === "day" || (bucket === "week" && weekday === 1) || (bucket === "month" && day.endsWith("-01"))) starts.push(day);
  }
  return starts.map((start, n) => ({ start, days: spanDays(start, n + 1 < starts.length ? addDays(starts[n + 1]!, -1) : to) }));
}

export function createPartnerDashboardStore(now: () => number) {
  const setups = seedSetups();
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const scale = (thirtyDays: number, days: number) => Math.round((thirtyDays * days) / 30);

  return {
    /** `GET .../summary` (`partner-summary.service.ts`): the money only for admins and owners (`:77`). */
    summary(partnerId: string, params: URLSearchParams, role: PartnerRole): Answer<PartnerSummary> {
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
      if (to < from) return invalid("to", "`to` is before `from`");
      const days = spanDays(from, to);
      if (days > MAX_RANGE_DAYS) return invalid("to", `At most ${MAX_RANGE_DAYS} days`);

      const bucket = bucketParam === "day" ? "day" : days <= 31 ? "day" : days <= 183 ? "week" : "month";
      const [finished, previousFinished] = FINISHED[partnerId] ?? [0, 0];
      const body: PartnerSummary = {
        range: { from, to, previous_from: addDays(from, -days), previous_to: addDays(from, -1), bucket },
        jobs_finished: scale(finished, days),
        previous_jobs_finished: scale(previousFinished, days),
        steps: structuredClone(STEPS_NOW[partnerId] ?? []),
      };
      if (role === "member") return { ok: true, body };

      const [earned, previousEarned] = EARNED[partnerId] ?? [0, 0];
      const total = scale(earned, days);
      // Spread over the buckets by their days; the last takes what rounding left. Older money is paid, the latest week still owed.
      const buckets = bucketsOf(from, to, bucket);
      let left = total;
      const series = buckets.map(({ start, days: bucketDays }, n) => {
        const amount = n === buckets.length - 1 ? left : Math.floor((total * bucketDays) / days);
        left -= amount;
        const recent = spanDays(start, to) <= 7;
        // The fake has no payout still on its way, so nothing is pending (erp-api `owed-dates.ts:35`).
        return { start, days: bucketDays, paid: money(recent ? 0 : amount), pending: money(0), owed: money(recent ? amount : 0) };
      });
      return { ok: true, body: { ...body, earned: money(total), previous_earned: money(scale(previousEarned, days)), currency: CURRENCY, series } };
    },

    /** `GET .../score`: Northcast scored, Layerline still new with 2 finished jobs. */
    score(partnerId: string): PartnerScoreResponse {
      if (partnerId === NORTHCAST_ID)
        return {
          score: { overall: 4.4, parts: { quality: 0.96, scrap: 0.98, reliability: 0.92, on_time: 0.81, rating: 0.88, claims: 0.95 }, finished_jobs: 23 },
          ratings: northcastRatings(now()),
        };
      return {
        score: { overall: null, parts: { quality: 1, scrap: 1, reliability: null, on_time: null, rating: null, claims: null }, finished_jobs: 2 },
        ratings: [],
      };
    },

    /** `GET .../setup`. */
    setup(partnerId: string): PartnerSetup {
      return structuredClone(setups.get(partnerId)!);
    },

    /**
     * `GET .../capacity-history` (`setup.service.ts:90-125`): UTC days, both included, the last 30 by default;
     * a row per day and step the partner can do, oldest day first, then step order. A bad range is a plain 400.
     */
    capacity(partnerId: string, params: URLSearchParams): { ok: true; body: { data: CapacityRow[] } } | { ok: false; detail: string } {
      const to = params.get("to") ?? today();
      const from = params.get("from") ?? addDays(to, -29);
      if (from > to) return { ok: false, detail: "to: must not be before from" };
      if (spanDays(from, to) > MAX_RANGE_DAYS) return { ok: false, detail: `from: a range covers at most ${MAX_RANGE_DAYS} days` };
      const capabilities = setups.get(partnerId)?.capabilities ?? [];
      const data: CapacityRow[] = [];
      for (let date = from; date <= to; date = addDays(date, 1)) {
        const i = spanDays(EPOCH, date);
        for (const { step_type, capacity, capacity_period } of capabilities) {
          const kept = step_type.key === "casting" && date < CASTING_RAISED_ON ? 45 : capacity;
          data.push({ date, step_type: structuredClone(step_type), load: LOADS[step_type.key]?.(i) ?? 0, capacity: kept, capacity_period });
        }
      }
      return { ok: true, body: { data } };
    },

    /** Test control: the workshop can't do any step any more, so nothing is kept for it. */
    clearCapabilities(partnerId: string): void {
      const setup = setups.get(partnerId);
      if (setup) setup.capabilities = [];
    },
  };
}

export type PartnerDashboardStore = ReturnType<typeof createPartnerDashboardStore>;
