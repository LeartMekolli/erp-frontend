/**
 * The dashboard's date range: what the person picked, whether erp-api would take a custom range,
 * which calendar days it covers and how it reads in words. Ranges are calendar days (`YYYY-MM-DD`) in
 * the workspace's time zone, both ends included, so nothing here uses a time or a time zone.
 */

export type RangePreset = "7d" | "30d" | "quarter" | "year";

export type RangeChoice = { preset: RangePreset } | { from: string; to: string };

/** The longest range erp-api answers for (`MAX_RANGE_DAYS`). */
export const MAX_RANGE_DAYS = 366;

/** What the dashboard opens on, a reload too: the range is kept on the page, never in the address. */
export const DEFAULT_CHOICE: RangeChoice = { preset: "30d" };
const DAY_MS = 24 * 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function utc(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

/** Whether `value` is a real calendar date written `YYYY-MM-DD`. */
function isDate(value: string | null): value is string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(utc(value)).toISOString().slice(0, 10) === value;
}

/** The date `days` after `date` (before it when negative). */
export function addDays(date: string, days: number): string {
  return new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** How many calendar days the range holds, both ends included. */
function spanDays(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY_MS) + 1;
}

/** The period before a range in words, counted from its dates: "previous 30 days", "previous day". */
export function previousRangeWords({ from, to }: { from: string; to: string }): string {
  const days = spanDays(from, to);
  return days === 1 ? "previous day" : `previous ${days} days`;
}

/** "Pick a valid date.", "The end is before the start." or "Pick at most 366 days." for a custom range erp-api would refuse, else null. */
export function checkCustomRange(from: string, to: string): string | null {
  if (!isDate(from) || !isDate(to)) return "Pick a valid date.";
  if (to < from) return "The end is before the start.";
  if (spanDays(from, to) > MAX_RANGE_DAYS) return `Pick at most ${MAX_RANGE_DAYS} days.`;
  return null;
}

/** The days a choice covers, ending `today` (the workspace's local date) for a preset. */
export function resolveRange(choice: RangeChoice, today: string): { from: string; to: string } {
  if (!("preset" in choice)) return { from: choice.from, to: choice.to };
  switch (choice.preset) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "quarter": {
      const firstMonth = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
      return { from: `${today.slice(0, 4)}-${String(firstMonth).padStart(2, "0")}-01`, to: today };
    }
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

const PRESET_WORDS: Record<RangePreset, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  quarter: "this quarter",
  year: "this year",
};

/** `28 Oct`, with the year when asked. */
function dayMonth(date: string, withYear: boolean): string {
  const day = Number(date.slice(8, 10));
  const month = MONTHS[Number(date.slice(5, 7)) - 1]!;
  return withYear ? `${day} ${month} ${date.slice(0, 4)}` : `${day} ${month}`;
}

/** A choice in words: "last 30 days", "1–31 Oct", "28 Oct – 3 Nov", "15 Dec 2025 – 3 Jan 2026". */
export function rangeWords(choice: RangeChoice): string {
  if ("preset" in choice) return PRESET_WORDS[choice.preset];
  const { from, to } = choice;
  if (from === to) return dayMonth(from, false);
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${dayMonth(from, true)} – ${dayMonth(to, true)}`;
  if (from.slice(5, 7) === to.slice(5, 7)) return `${Number(from.slice(8, 10))}–${dayMonth(to, false)}`;
  return `${dayMonth(from, false)} – ${dayMonth(to, false)}`;
}
