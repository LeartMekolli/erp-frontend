import { amountForScale, compactAxis, percentAxis } from "@/components/charts/scale-helpers";
import type { DashboardRange } from "@/lib/api/schema-types";
import { formatMoney, LOCALE } from "@/lib/format/money";

/** What the dark hero tile leads with. */
export type Headline = "revenue" | "on_time" | "orders";

/** The first headline this reader may see: revenue, else on time, else orders placed. */
export function pickHero(range: DashboardRange): Headline {
  if (range.current.orders.revenue !== undefined) return "revenue";
  if (range.current.production.on_time_rate !== null) return "on_time";
  return "orders";
}

export type Change = {
  arrow: "▲" | "▼" | null;
  /** "12%", "3 pts", or "No change". */
  words: string;
  /** Whether the move is for the better; null when nothing moved. */
  better: boolean | null;
};

/** At most one decimal, without a trailing ".0". */
function oneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function moved(delta: number, words: string, betterWhen: "up" | "down"): Change {
  if (words === "0") return { arrow: null, words: "No change", better: null };
  const up = delta > 0;
  return { arrow: up ? "▲" : "▼", words, better: up === (betterWhen === "up") };
}

/**
 * How `now` moved from `before`. Rates (0–1) change in points ("3 pts"), counts in percent ("12%").
 * Null when either side is missing, or a count had nothing to grow from.
 */
export function change(
  now: number | null,
  before: number | null,
  betterWhen: "up" | "down",
  measure: "rate" | "count" = "rate",
): Change | null {
  if (now === null || before === null) return null;
  if (measure === "rate") {
    const points = (now - before) * 100;
    const words = oneDecimal(Math.abs(points));
    return moved(points, words === "1" ? "1 pt" : words === "0" ? "0" : `${words} pts`, betterWhen);
  }
  if (before === 0) return now === 0 ? { arrow: null, words: "No change", better: null } : null;
  const percent = ((now - before) / before) * 100;
  const words = String(Math.round(Math.abs(percent)));
  return moved(percent, words === "0" ? "0" : `${words}%`, betterWhen);
}

/** erp-api's money string in minor units, read digit by digit: no float touches the amount. */
function minorUnits(amount: string): number {
  const negative = amount.startsWith("-");
  const [whole, fraction = ""] = amount.replace("-", "").split(".");
  const units = Number(BigInt(`${whole}${fraction.padEnd(2, "0").slice(0, 2)}`));
  return negative ? -units : units;
}

/** `part` as a whole percentage of `whole`, read from the strings; null when `whole` is zero. */
export function shareOf(part: string, whole: string): number | null {
  const total = minorUnits(whole);
  return total === 0 ? null : Math.round((minorUnits(part) / total) * 100);
}

/** How a money amount moved, in percent. Null when either side is missing. */
export function moneyChange(now: string | null | undefined, before: string | null | undefined, betterWhen: "up" | "down"): Change | null {
  if (now === null || now === undefined || before === null || before === undefined) return null;
  return change(minorUnits(now), minorUnits(before), betterWhen, "count");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A point's label: "16 Nov" for a day or a week, "Nov 2026" for a month. Calendar dates, no time zone. */
export function bucketLabel(start: string, bucket: DashboardRange["range"]["bucket"]): string {
  const month = MONTHS[Number(start.slice(5, 7)) - 1]!;
  return bucket === "month" ? `${month} ${start.slice(0, 4)}` : `${Number(start.slice(8, 10))} ${month}`;
}

/** How many days the range holds: its points' days added up. */
export function rangeDays(range: DashboardRange): number {
  return range.series.reduce((total, point) => total + point.days, 0);
}

/** "No orders in these 30 days", for a range that has none. */
export function noOrdersWords(range: DashboardRange): string {
  const days = rangeDays(range);
  return days === 1 ? "No orders on this day" : `No orders in these ${days} days`;
}

/** "previous 30 days", "previous day": what a change is measured against. */
export function previousWords(range: DashboardRange): string {
  const days = rangeDays(range);
  return days === 1 ? "previous day" : `previous ${days} days`;
}

/** A rate as a percentage with at most one decimal: `0.024` is `2.4%`. */
export function percent(rate: number): string {
  return `${oneDecimal(rate * 100)}%`;
}

export type MetricKey = "revenue" | "orders" | "average" | "on_time" | "defects";

/** One figure of the range, ready to show: in words for people, in numbers for the chart's marks. */
export type Metric = {
  key: MetricKey;
  label: string;
  /** This range's figure in words; "No data" when erp-api has none for it. */
  figure: string;
  /** The previous range's figure in words, or null when it has none. */
  before: string | null;
  change: Change | null;
  /** A point per bucket, for marks only: null where there's no value. */
  values: (number | null)[];
  previous: (number | null)[];
  /** For money: each point in words from erp-api's strings, for the tooltip and the table. */
  words?: { values: (string | undefined)[]; previous: (string | undefined)[] };
  /** The text for a mark's value, in the tooltip and the table, where `words` has none. */
  format: (value: number) => string;
  axis: (value: number) => string;
};

const LABEL: Record<MetricKey, string> = {
  revenue: "Revenue",
  orders: "Orders placed",
  average: "Average order",
  on_time: "On time",
  defects: "Defect rate",
};

const NO_DATA = "No data";

const counts = new Intl.NumberFormat(LOCALE);

const scaled = (amount: string | null | undefined) => (amount === null || amount === undefined ? null : amountForScale(amount));

/**
 * A figure of the range as this reader may see it, or null when erp-api left it out (no
 * `payment.read` for money). Money stays erp-api's string for every word shown; the numbers only place marks.
 */
export function metric(range: DashboardRange, key: MetricKey): Metric | null {
  const { current, previous, series } = range;
  const currency = current.currency;
  // Every money point has its words from the string, so `money` is never reached for a shown amount;
  // it only keeps `format` total. toFixed(2) keeps it a valid amount (String() can give exponent form).
  const money = (value: number) => formatMoney(value.toFixed(2), currency);
  const amountWords = (amount: string | null | undefined) =>
    amount === null || amount === undefined ? undefined : formatMoney(amount, currency);
  const base = { key, label: LABEL[key] };
  switch (key) {
    case "revenue": {
      const now = current.orders.revenue;
      if (now === undefined) return null;
      const before = previous.orders.revenue;
      return {
        ...base,
        figure: formatMoney(now, currency),
        before: before === undefined ? null : formatMoney(before, currency),
        change: moneyChange(now, before, "up"),
        values: series.map((point) => scaled(point.revenue)),
        previous: series.map((point) => scaled(point.previous.revenue)),
        words: {
          values: series.map((point) => amountWords(point.revenue)),
          previous: series.map((point) => amountWords(point.previous.revenue)),
        },
        format: money,
        axis: (value) => compactAxis(value, currency),
      };
    }
    case "average": {
      const now = current.orders.average_value;
      if (now === undefined) return null;
      const before = previous.orders.average_value;
      return {
        ...base,
        figure: now === null ? NO_DATA : formatMoney(now, currency),
        before: before === null || before === undefined ? null : formatMoney(before, currency),
        change: moneyChange(now, before, "up"),
        values: series.map((point) => scaled(point.average_value)),
        previous: series.map((point) => scaled(point.previous.average_value)),
        words: {
          values: series.map((point) => amountWords(point.average_value)),
          previous: series.map((point) => amountWords(point.previous.average_value)),
        },
        format: money,
        axis: (value) => compactAxis(value, currency),
      };
    }
    case "orders":
      return {
        ...base,
        figure: counts.format(current.orders.placed),
        before: counts.format(previous.orders.placed),
        change: change(current.orders.placed, previous.orders.placed, "up", "count"),
        values: series.map((point) => point.orders_placed),
        previous: series.map((point) => point.previous.orders_placed),
        format: (value) => counts.format(value),
        axis: (value) => compactAxis(value),
      };
    case "on_time":
    case "defects": {
      const field = key === "on_time" ? "on_time_rate" : "defect_rate";
      const now = current.production[field];
      const before = previous.production[field];
      return {
        ...base,
        figure: now === null ? NO_DATA : percent(now),
        before: before === null ? null : percent(before),
        change: change(now, before, key === "on_time" ? "up" : "down"),
        values: series.map((point) => point[field]),
        previous: series.map((point) => point.previous[field]),
        format: percent,
        axis: percentAxis,
      };
    }
  }
}

/** The metrics the hero's chips switch between, the headline first; only the ones this reader may see. */
export function heroMetrics(range: DashboardRange): Metric[] {
  const keys: MetricKey[] = pickHero(range) === "on_time" ? ["on_time", "orders"] : ["revenue", "orders", "average"];
  return keys.map((key) => metric(range, key)).filter((one) => one !== null);
}

/** The KPI tiles under the hero: On time goes when it is the hero. */
export function kpiMetrics(range: DashboardRange): Metric[] {
  const hero = pickHero(range);
  const keys: MetricKey[] = ["orders", "average", "on_time", "defects"];
  return keys
    .filter((key) => !(key === "on_time" && hero === "on_time"))
    .map((key) => metric(range, key))
    .filter((one) => one !== null);
}
