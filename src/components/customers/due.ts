import { formatDay } from "@/lib/format/dates";
import { LOCALE } from "@/lib/format/money";

const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * A due date (`YYYY-MM-DD`, no zone): `26 Dec` this year, `26 Dec 2027` another. Built in UTC, as
 * `formatDay` is, so no zone can move it.
 */
export function dueText(day: string, thisYear = new Date().getUTCFullYear()): string {
  const full = formatDay(day);
  return Number(day.slice(0, 4)) === thisYear ? dayMonth.format(Date.parse(`${day}T00:00:00Z`)) : full;
}
