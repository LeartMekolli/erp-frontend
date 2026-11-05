import { LOCALE } from "./money";

type Style = "date" | "dateTime" | "time";

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  dateTime: { dateStyle: "medium", timeStyle: "short" },
  time: { timeStyle: "short" },
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function format(style: Style, timeZone: string, date: Date): string {
  const key = `${style} ${timeZone}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { ...OPTIONS[style], timeZone });
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
