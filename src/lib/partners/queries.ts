"use client";

import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { isApiProblem, problemFrom } from "@/lib/api/problem";
import type {
  EligiblePartners,
  JobAssignment,
  OfferBody,
  PayRefusedProblem,
  ReassignBody,
  StaffOwedJob,
  StaffPartner,
  StaffPayout,
} from "@/lib/api/schema-types";
import { invalidateOrders } from "@/lib/orders/queries";
import { PAYOUT_POLL_MS, pendingIn, totalsOf, type OwedTotals } from "@/lib/payouts/poll";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList, type Page } from "@/lib/query/use-cursor-list";

const PAGE_SIZE = 20;

export const partnersKeys = {
  all: ["partners"] as const,
  eligible: (groupId: string) => ["partners", "eligible", groupId] as const,
  list: ["partners", "list"] as const,
  detail: (id: string) => ["partners", "detail", id] as const,
  owed: (id: string) => ["partners", "owed", id] as const,
  payouts: (id: string) => ["partners", "payouts", id] as const,
};

/** A hand-over changes who has the line and every partner's room. */
function refresh(client: QueryClient) {
  return Promise.all([invalidateOrders(client), client.invalidateQueries({ queryKey: partnersKeys.all })]);
}

/** Who can take a job, best score first, and who can't, with why. Staff with `partner.assign` only. */
export function useEligiblePartners(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: partnersKeys.eligible(groupId),
    queryFn: async (): Promise<EligiblePartners> => {
      const { data, error, response } = await api.GET("/partners/eligible", { params: { query: { group_id: groupId } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
  });
}

/** Offers a job to a partner, until the workspace's deadline. */
export function useOfferJob() {
  const client = useQueryClient();
  return useApiMutation<{ groupId: string; body: OfferBody }, JobAssignment>(
    async ({ groupId, body }, key) => {
      const { data, error, response } = await api.POST("/partners/jobs/{groupId}/offer", { params: { path: { groupId }, header: idempotencyHeader(key) }, body });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => refresh(client) },
  );
}

/** Takes back an offer the partner hasn't answered. */
export function useWithdrawOffer() {
  const client = useQueryClient();
  return useApiMutation<string, JobAssignment>(
    async (groupId, key) => {
      const { data, error, response } = await api.POST("/partners/jobs/{groupId}/withdraw", { params: { path: { groupId }, header: idempotencyHeader(key) } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => refresh(client) },
  );
}

/** Moves an accepted job to another partner, who has it at once. */
export function useReassignJob() {
  const client = useQueryClient();
  return useApiMutation<{ groupId: string; body: ReassignBody }, JobAssignment>(
    async ({ groupId, body }, key) => {
      const { data, error, response } = await api.POST("/partners/jobs/{groupId}/reassign", { params: { path: { groupId }, header: idempotencyHeader(key) }, body });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => refresh(client) },
  );
}

/** The workshops, newest first, 20 at a time. Staff with `partner.read` only. */
export function usePartners() {
  return useCursorList<StaffPartner>({
    queryKey: partnersKeys.list,
    fetchPage: async (cursor) => {
      const { data, error, response } = await api.GET("/partners", { params: { query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** One workshop, with where its payout account stands. */
export function usePartner(id: string) {
  return useQuery({
    queryKey: partnersKeys.detail(id),
    queryFn: async (): Promise<StaffPartner> => {
      const { data, error, response } = await api.GET("/partners/{id}", { params: { path: { id } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** An owed page in the cursor list's shape: its jobs as `data`. */
type StaffOwedPage = Page<StaffOwedJob> & OwedTotals;

/** What the workshop is owed, per job, 20 at a time; `totals` from the first page. With `poll`, re-read while a payout is on its way. */
export function useStaffPartnerOwed(id: string, { poll }: { poll: boolean }) {
  const list = useCursorList<StaffOwedJob, StaffOwedPage>({
    queryKey: partnersKeys.owed(id),
    fetchPage: async (cursor) => {
      const { data, error, response } = await api.GET("/partners/{id}/owed", {
        params: { path: { id }, query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } },
      });
      if (!data) throw problemFrom(error, response);
      const { jobs, ...rest } = data;
      return { ...rest, data: jobs };
    },
    refetchInterval: poll ? PAYOUT_POLL_MS : false,
  });
  return { ...list, totals: totalsOf(list.data?.pages[0]) };
}

/** The workshop's payouts, newest first, 20 at a time; re-read while any is on its way. Needs `payment.read`. */
export function useStaffPartnerPayouts(id: string, enabled: boolean) {
  const list = useCursorList<StaffPayout>({
    queryKey: partnersKeys.payouts(id),
    fetchPage: async (cursor) => {
      const { data, error, response } = await api.GET("/partners/{id}/payouts", {
        params: { path: { id }, query: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
    refetchInterval: (data) => (pendingIn(data?.pages) ? PAYOUT_POLL_MS : false),
  });
  return { ...list, anyPending: pendingIn(list.data?.pages) };
}

/**
 * Pays everything the workshop is owed now. The new payout goes to the top of the payouts list at once;
 * a refusal (409) means the page was out of date, so the partner, owed and payouts are read again.
 */
export function usePayPartner(id: string) {
  const client = useQueryClient();
  const readAgain = (...keys: (readonly unknown[])[]) => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
  return useApiMutation<void, StaffPayout>(
    async (_vars, key) => {
      const { data, error, response } = await api.POST("/partners/{id}/payouts", { params: { path: { id }, header: idempotencyHeader(key) } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    {
      onSuccess: (payout) => {
        client.setQueryData<InfiniteData<Page<StaffPayout>, string | undefined>>(partnersKeys.payouts(id), (old) => {
          if (!old) return old;
          const [first, ...rest] = old.pages;
          if (!first) return old;
          return { ...old, pages: [{ ...first, data: [payout, ...first.data.filter((item) => item.id !== payout.id)] }, ...rest] };
        });
        // Not awaited: the dialog closes on the 202, and the lists catch up when the re-read lands.
        void readAgain(partnersKeys.owed(id), partnersKeys.payouts(id));
      },
      onError: (error) =>
        isApiProblem(error) && error.status === 409
          ? readAgain(partnersKeys.detail(id), partnersKeys.owed(id), partnersKeys.payouts(id))
          : undefined,
    },
  );
}

/**
 * Why erp-api refused a pay: its code, `"other"` for a 409 without one of the two codes, and undefined for
 * any failure that isn't a 409 (`payout_account_not_ready`, `nothing_due`; erp-api `payment-response.ts:173`).
 */
export function payRefusal(error: unknown): PayRefusedProblem["code"] | "other" | undefined {
  if (!isApiProblem(error) || error.status !== 409) return undefined;
  return error.code === "payout_account_not_ready" || error.code === "nothing_due" ? error.code : "other";
}

/** Asks for a one-time link to send the partner, to set up or finish the payout account. Staff with `partner.write` only. */
export function useStaffPayoutLink(id: string) {
  return useApiMutation<void, { url: string; expires_at: string }>(async (_vars, key) => {
    const { data, error, response } = await api.POST("/partners/{id}/payout-account/link", { params: { path: { id }, header: idempotencyHeader(key) } });
    if (!data) throw problemFrom(error, response);
    return { url: data.url, expires_at: data.expires_at };
  });
}
