import { LOCALE } from "./money";

type Style = "date" | "dateTime" | "time" | "dayMonth" | "key";

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  dateTime: { dateStyle: "medium", timeStyle: "short" },
  time: { timeStyle: "short" },
  dayMonth: { day: "numeric", month: "short" },
  key: { year: "numeric", month: "2-digit", day: "2-digit" },
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function format(style: Style, timeZone: string, date: Date): string {
  const key = `${style} ${timeZone}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    // Canadian English writes a day as `YYYY-MM-DD`, the shape a key needs.
    formatter = new Intl.DateTimeFormat(style === "key" ? "en-CA" : LOCALE, { ...OPTIONS[style], timeZone });
    formatters.set(key, formatter);
  }
  return formatter.format(date);
}

/** An instant's day in the workspace's zone: `5 Nov 2026`. */
export function formatDate(iso: string, timeZone: string): string {
  return format("date", timeZone, new Date(iso));
}

/** `5 Nov 2026, 14:05`, in the workspace's zone. */
export function formatDateTime(iso: string, timeZone: string): string {
  return format("dateTime", timeZone, new Date(iso));
}

/** `14:05`, in the workspace's zone. */
export function formatTime(iso: string, timeZone: string): string {
  return format("time", timeZone, new Date(iso));
}

/** `11 Nov`, in the workspace's zone. */
export function formatDayMonth(iso: string, timeZone: string): string {
  return format("dayMonth", timeZone, new Date(iso));
}

/** An instant's calendar day in the zone, as `YYYY-MM-DD`: what two instants on the same day share. */
export function dayKey(iso: string, timeZone: string): string {
  return format("key", timeZone, new Date(iso));
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** How far the zone's clock is ahead of UTC at an instant, in ms: "GMT+13:00" is 13 hours, "GMT" none. */
function zoneOffsetMs(at: number, timeZone: string): number {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
    offsetFormatters.set(timeZone, formatter);
  }
  const name = formatter.formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -1 : 1) * minutes * 60_000;
}

/**
 * The instant a calendar day (`YYYY-MM-DD`) starts in the zone, as a UTC ISO string: what erp-api's `from`
 * and `to` take. The offset is read at the guess, then again at the result, so a day a clock change falls on
 * still starts at its own local midnight.
 */
export function dayStartIso(day: string, timeZone: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const midnightUtc = Date.UTC(year, month - 1, date);
  const first = midnightUtc - zoneOffsetMs(midnightUtc, timeZone);
  return new Date(midnightUtc - zoneOffsetMs(first, timeZone)).toISOString();
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A calendar day such as `promised_on` (`YYYY-MM-DD`). It has no zone, so it
 * is built and shown in UTC: no workspace or browser zone can move it.
 */
export function formatDay(day: string): string {
  const match = DAY.exec(day);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!date || date.toISOString().slice(0, 10) !== day) throw new Error(`Not a calendar day: ${JSON.stringify(day)}`);
  return format("date", "UTC", date);
}
