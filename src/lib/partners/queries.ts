"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotent } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { EligiblePartners, JobAssignment, OfferBody, ReassignBody } from "@/lib/api/schema-types";
import { invalidateOrders } from "@/lib/orders/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";

export const partnersKeys = {
  all: ["partners"] as const,
  eligible: (groupId: string) => ["partners", "eligible", groupId] as const,
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
      const { data, error, response } = await api.POST("/partners/jobs/{groupId}/offer", { params: { path: { groupId } }, body, ...idempotent(key) });
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
      const { data, error, response } = await api.POST("/partners/jobs/{groupId}/withdraw", { params: { path: { groupId } }, ...idempotent(key) });
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
      const { data, error, response } = await api.POST("/partners/jobs/{groupId}/reassign", { params: { path: { groupId } }, body, ...idempotent(key) });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => refresh(client) },
  );
}
