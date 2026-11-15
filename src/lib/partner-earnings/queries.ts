"use client";

import { useQuery } from "@tanstack/react-query";

import { partnerApi } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";
import type { OwedJob, PartnerPayout, PayoutAccountState } from "@/lib/api/schema-types";
import { PAYOUT_POLL_MS, pendingIn, totalsOf, type OwedTotals } from "@/lib/payouts/poll";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList, type Page } from "@/lib/query/use-cursor-list";

const PAGE_SIZE = 20;
/** After the provider sends the owner back, the account is re-read this often until it's ready. */
const ACCOUNT_POLL_MS = 5_000;

export const partnerEarningsKeys = {
  all: (partnerId: string) => ["partner-earnings", partnerId] as const,
  owed: (partnerId: string) => ["partner-earnings", partnerId, "owed"] as const,
  payouts: (partnerId: string) => ["partner-earnings", partnerId, "payouts"] as const,
  account: (partnerId: string) => ["partner-earnings", partnerId, "account"] as const,
};

export type { OwedTotals };

/** An owed page in the cursor list's shape: its jobs as `data`. */
type OwedPage = Page<OwedJob> & OwedTotals;

/** What the workshop is owed, per job, newest hand-over first, 20 at a time; `totals` from the first page. */
export function usePartnerOwed(partnerId: string, { enabled, poll }: { enabled: boolean; poll: boolean }) {
  const list = useCursorList<OwedJob, OwedPage>({
    queryKey: partnerEarningsKeys.owed(partnerId),
    fetchPage: async (cursor) => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/owed", {
        params: { path: { partnerId }, query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } },
      });
      if (!data) throw problemFrom(error, response);
      const { jobs, ...rest } = data;
      return { ...rest, data: jobs };
    },
    enabled,
    refetchInterval: poll ? PAYOUT_POLL_MS : false,
  });
  return { ...list, totals: totalsOf(list.data?.pages[0]) };
}

/** The workshop's payouts, newest first, 20 at a time; re-read while any is on its way. */
export function usePartnerPayouts(partnerId: string, enabled: boolean) {
  const list = useCursorList<PartnerPayout>({
    queryKey: partnerEarningsKeys.payouts(partnerId),
    fetchPage: async (cursor) => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/payouts", {
        params: { path: { partnerId }, query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
    refetchInterval: (data) => (pendingIn(data?.pages) ? PAYOUT_POLL_MS : false),
  });
  return { ...list, anyPending: pendingIn(list.data?.pages) };
}

/** Where the payout account stands; with `checking`, re-read until it's ready. */
export function usePayoutAccount(partnerId: string, { enabled, checking }: { enabled: boolean; checking: boolean }) {
  return useQuery({
    queryKey: partnerEarningsKeys.account(partnerId),
    queryFn: async (): Promise<{ state: PayoutAccountState }> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/payout-account", {
        params: { path: { partnerId } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
    refetchInterval: (query) => (checking && query.state.data?.state !== "ready" ? ACCOUNT_POLL_MS : false),
  });
}

/** Asks for a one-time link to set up or finish the payout account; resolves to its address. Owners only. */
export function usePayoutLink(partnerId: string) {
  return useApiMutation<void, string>(async () => {
    const { data, error, response } = await partnerApi.POST("/partner-portal/partners/{partnerId}/payout-account/link", {
      params: { path: { partnerId } },
    });
    if (!data) throw problemFrom(error, response);
    return data.url;
  });
}
