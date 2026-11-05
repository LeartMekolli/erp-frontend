"use client";

import { useMe } from "@/components/session/session-gate";

import { formatDate, formatDateTime, formatDay, formatTime } from "./dates";
import { formatMoney } from "./money";

/**
 * Formatters bound to the workspace's time zone, with its default currency for
 * values that carry none. Only under SessionGate, where `/me` is loaded.
 */
export function useFormat() {
  const { data: me } = useMe();
  if (!me) throw new Error("useFormat needs /me: use it under SessionGate.");
  const { timezone: timeZone, default_currency: currency } = me.workspace;
  return {
    money: formatMoney,
    date: (iso: string) => formatDate(iso, timeZone),
    dateTime: (iso: string) => formatDateTime(iso, timeZone),
    time: (iso: string) => formatTime(iso, timeZone),
    day: formatDay,
    timeZone,
    currency,
  };
}
