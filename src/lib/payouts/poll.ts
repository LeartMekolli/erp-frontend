"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { PartnerOwed, PayoutStatus } from "@/lib/api/schema-types";
import type { Page } from "@/lib/query/use-cursor-list";

/** While a payout is on its way, payouts and what's owed are re-read this often. */
export const PAYOUT_POLL_MS = 15_000;

/** The owed totals, which cover every page: each page carries the same. */
export type OwedTotals = Pick<PartnerOwed, "due_total" | "not_yet_total" | "not_yet_count" | "currency">;

/** The totals an owed page carries, or undefined before it has loaded. */
export function totalsOf(page: OwedTotals | undefined): OwedTotals | undefined {
  return (
    page && {
      due_total: page.due_total,
      not_yet_total: page.not_yet_total,
      not_yet_count: page.not_yet_count,
      currency: page.currency,
    }
  );
}

/** Whether any loaded payout is still on its way. */
export const pendingIn = (pages: readonly Page<{ status: PayoutStatus }>[] | undefined): boolean =>
  pages?.some((page) => page.data.some((payout) => payout.status === "pending")) ?? false;

/**
 * The two polls drift apart. When the payouts poll sees the last payout settle first, the owed poll
 * stops before it catches up, so this reads what's owed once more: a failed payout's money is owed again.
 */
export function useOwedCatchUp(anyPending: boolean, owedKey: QueryKey): void {
  const client = useQueryClient();
  const wasPending = useRef(false);
  // A fresh `owedKey` array each render only re-runs this effect; the invalidation fires on the pending-to-settled change, once.
  useEffect(() => {
    if (wasPending.current && !anyPending) void client.invalidateQueries({ queryKey: owedKey });
    wasPending.current = anyPending;
  }, [anyPending, client, owedKey]);
}
