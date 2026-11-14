"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { partnerApi } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { JobAssignment, PartnerJob, PartnerJobDetail, PartnerJobStatus } from "@/lib/api/schema-types";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList } from "@/lib/query/use-cursor-list";

const PAGE_SIZE = 20;

export const partnerJobsKeys = {
  all: (partnerId: string) => ["partner-jobs", partnerId] as const,
  list: (partnerId: string, status: PartnerJobStatus) => ["partner-jobs", partnerId, "list", status] as const,
  detail: (partnerId: string, groupId: string) => ["partner-jobs", partnerId, "detail", groupId] as const,
};

/** A workshop's jobs with one status, newest hand-over first, 20 at a time. */
export function usePartnerJobs(partnerId: string, status: PartnerJobStatus, enabled = true) {
  return useCursorList<PartnerJob>({
    queryKey: partnerJobsKeys.list(partnerId, status),
    fetchPage: async (cursor) => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs", {
        params: { path: { partnerId }, query: { status, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
  });
}

/** One job offered to or accepted by the workshop. */
export function usePartnerJob(partnerId: string, groupId: string) {
  return useQuery({
    queryKey: partnerJobsKeys.detail(partnerId, groupId),
    queryFn: async (): Promise<PartnerJobDetail> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}", {
        params: { path: { partnerId, groupId } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** Accepts or declines an offer; every list and detail of the workshop's jobs fetches again. */
export function useAnswerOffer(partnerId: string) {
  const client = useQueryClient();
  return useApiMutation<{ groupId: string; answer: "accept" | "decline" }, JobAssignment>(
    async ({ groupId, answer }, key) => {
      const params = { path: { partnerId, groupId }, header: idempotencyHeader(key) };
      const { data, error, response } =
        answer === "accept"
          ? await partnerApi.POST("/partner-portal/partners/{partnerId}/jobs/{groupId}/accept", { params })
          : await partnerApi.POST("/partner-portal/partners/{partnerId}/jobs/{groupId}/decline", { params });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => client.invalidateQueries({ queryKey: partnerJobsKeys.all(partnerId) }) },
  );
}
