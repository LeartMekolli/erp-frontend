import type { NeedsReason, Order, OrderState, PaymentState } from "@/lib/api/schema-types";
import { formatDay } from "@/lib/format/dates";
import { LOCALE } from "@/lib/format/money";

import type { Tab } from "./view";

export const STATE_LABEL: Record<OrderState, string> = {
  awaiting_payment: "Awaiting payment",
  in_production: "In production",
  ready: "Ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** `none` shows nothing. */
export const PAYMENT_LABEL: Record<PaymentState, string | null> = {
  awaiting_payment: "Awaiting",
  paid: "Paid",
  not_billed: "Not billed",
  invoiced: "Invoiced",
  overdue: "Overdue",
  refunded: "Refunded",
  partly_refunded: "Partly refunded",
  none: null,
};

export const NEEDS_LABEL: Record<NeedsReason, string> = {
  late: "Late",
  to_ship: "To ship",
  to_collect: "To collect",
  due_soon: "Due soon",
};

export const TAB_LABEL: Record<Tab, string> = {
  needs: "Needs you",
  all: "All",
  ...STATE_LABEL,
  ready: "Ready",
};

/** One line: `40 × Bracket`; more: `3 lines`. */
export function linesSummary(lines: Order["lines"]): string {
  const [only] = lines;
  return lines.length === 1 && only ? `${only.quantity} × ${only.product.name}` : `${lines.length} lines`;
}

const todayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Today in the workspace's zone, as `YYYY-MM-DD`. */
export function workspaceToday(timeZone: string, now: number = Date.now()): string {
  let formatter = todayFormatters.get(timeZone);
  if (!formatter) {
    // en-CA writes dates as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    todayFormatters.set(timeZone, formatter);
  }
  return formatter.format(now);
}

const asUtc = (day: string) => Date.parse(`${day}T00:00:00Z`);
const DAY_MS = 86_400_000;

/** Whole days from one calendar day to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((asUtc(to) - asUtc(from)) / DAY_MS);
}

/** A calendar day plus whole days. */
export function addDays(day: string, days: number): string {
  return new Date(asUtc(day) + days * DAY_MS).toISOString().slice(0, 10);
}

const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * When an order is promised, against the workspace's today: `5 Nov · tomorrow`,
 * `2 Nov · 2 days late`. A past day that isn't late (shipped) is the date alone.
 */
export function promisedText(day: string, today: string, late: boolean): string {
  const date = day.slice(0, 4) === today.slice(0, 4) ? dayMonth.format(asUtc(day)) : formatDay(day);
  const days = daysBetween(today, day);
  if (days === 0) return `${date} · today`;
  if (days === 1) return `${date} · tomorrow`;
  if (days > 1) return `${date} · in ${days} days`;
  return late ? `${date} · ${plural(-days, "day")} late` : date;
}
