"use client";

import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";

import { partnerApi } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type {
  JobAssignment,
  MoveBody,
  MoveResponse,
  PartnerJob,
  PartnerJobComment,
  PartnerJobDetail,
  PartnerJobStatus,
  PartnerMoveHistory,
  PartnerWorkOrder,
} from "@/lib/api/schema-types";
import type { Photo } from "@/lib/production/shape";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList } from "@/lib/query/use-cursor-list";

const PAGE_SIZE = 20;
const MOVES_PAGE = 25;
const COMMENTS_PAGE = 50;

/** A job's History: every action, or only fails and corrections that put pieces at a step. */
export type PartnerMovesFilter = "all" | "fails";

export const partnerJobsKeys = {
  all: (partnerId: string) => ["partner-jobs", partnerId] as const,
  list: (partnerId: string, status: PartnerJobStatus) => ["partner-jobs", partnerId, "list", status] as const,
  detail: (partnerId: string, groupId: string) => ["partner-jobs", partnerId, "detail", groupId] as const,
  piece: (partnerId: string, groupId: string, id: string) => ["partner-jobs", partnerId, "piece", groupId, id] as const,
  moves: (partnerId: string, groupId: string, filter: PartnerMovesFilter) => ["partner-jobs", partnerId, "moves", groupId, filter] as const,
  comments: (partnerId: string, groupId: string) => ["partner-jobs", partnerId, "comments", groupId] as const,
};

type Link = { url: string };

/** A link from a partner route, or erp-api's refusal. */
function urlOf({ data, error, response }: { data?: Link; error?: unknown; response: Response }): string {
  if (!data) throw problemFrom(error, response);
  return data.url;
}

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

/** How often a job whose AI brief is still being written is asked again. */
const BRIEF_POLL_MS = 10_000;

/** One job offered to or accepted by the workshop, asked again while its AI brief is being written. */
export function usePartnerJob(partnerId: string, groupId: string, enabled = true) {
  return useQuery({
    queryKey: partnerJobsKeys.detail(partnerId, groupId),
    queryFn: async (): Promise<PartnerJobDetail> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}", {
        params: { path: { partnerId, groupId } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
    refetchInterval: (query) => (query.state.data?.summary?.status === "pending" ? BRIEF_POLL_MS : false),
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

/** One piece of a job the workshop holds, with every move it has had. */
export function usePartnerPiece(partnerId: string, groupId: string, id: string) {
  return useQuery({
    queryKey: partnerJobsKeys.piece(partnerId, groupId, id),
    queryFn: async (): Promise<PartnerWorkOrder> => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}/work-orders/{workOrderId}", {
        params: { path: { partnerId, groupId, workOrderId: id } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/**
 * A job's moves, one item per action, newest first, with when the job came to the workshop. `counts`
 * covers every page whatever the filter, so while one filter loads its counts come from the other's list.
 */
export function usePartnerMoves(partnerId: string, groupId: string, filter: PartnerMovesFilter) {
  const client = useQueryClient();
  const list = useCursorList<PartnerMoveHistory["data"][number], PartnerMoveHistory>({
    queryKey: partnerJobsKeys.moves(partnerId, groupId, filter),
    fetchPage: async (cursor) => {
      const query = { limit: MOVES_PAGE, ...(filter === "fails" ? { only: "fails" as const } : {}), ...(cursor ? { cursor } : {}) };
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}/moves", {
        params: { path: { partnerId, groupId }, query },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
  const other = client.getQueryData<InfiniteData<PartnerMoveHistory>>(partnerJobsKeys.moves(partnerId, groupId, filter === "all" ? "fails" : "all"));
  const first = list.data?.pages[0] ?? other?.pages[0];
  return { ...list, counts: first?.counts ?? null, handedOverAt: first?.handed_over_at ?? null };
}

/** Passes, fails or corrects pieces of the workshop's jobs; every job of the workshop fetches again. */
export function usePartnerMovePieces(partnerId: string) {
  const client = useQueryClient();
  return useApiMutation<MoveBody, MoveResponse>(
    async (body, key) => {
      const { data, error, response } = await partnerApi.POST("/partner-portal/partners/{partnerId}/moves", {
        params: { path: { partnerId }, header: idempotencyHeader(key) },
        body,
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    {
      onSettled: () => {
        void client.invalidateQueries({ queryKey: partnerJobsKeys.all(partnerId) });
      },
    },
  );
}

/** The comments between staff and the workshop on a job it holds, oldest first. */
export function usePartnerComments(partnerId: string, groupId: string) {
  return useCursorList<PartnerJobComment>({
    queryKey: partnerJobsKeys.comments(partnerId, groupId),
    fetchPage: async (cursor) => {
      const { data, error, response } = await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}/comments", {
        params: { path: { partnerId, groupId }, query: { limit: COMMENTS_PAGE, ...(cursor ? { cursor } : {}) } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** Posts a comment on the job, in text; staff read it. */
export function usePostPartnerComment(partnerId: string, groupId: string) {
  const client = useQueryClient();
  return useApiMutation<string, PartnerJobComment>(
    async (body, key) => {
      const { data, error, response } = await partnerApi.POST("/partner-portal/partners/{partnerId}/jobs/{groupId}/comments", {
        params: { path: { partnerId, groupId }, header: idempotencyHeader(key) },
        body: { body },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => client.invalidateQueries({ queryKey: partnerJobsKeys.comments(partnerId, groupId) }) },
  );
}

/** A short-lived link to the job's design file. */
export async function partnerDesignUrl(partnerId: string, groupId: string): Promise<string> {
  return urlOf(await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}/design", { params: { path: { partnerId, groupId } } }));
}

/** A short-lived link to the instructions of one of the workshop's steps. */
export async function partnerSopUrl(partnerId: string, groupId: string, stepKey: string): Promise<string> {
  return urlOf(
    await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}/steps/{stepKey}/sop", { params: { path: { partnerId, groupId, stepKey } } }),
  );
}

/** A short-lived link to a QC photo, through the move it came with. */
export async function partnerPhotoUrl(partnerId: string, groupId: string, photo: Photo): Promise<string> {
  if (!photo.moveId) throw new Error("A partner opens a photo through its move");
  return urlOf(
    await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}/moves/{moveId}/photos/{fileVersionId}/url", {
      params: { path: { partnerId, groupId, moveId: photo.moveId, fileVersionId: photo.fileVersionId } },
    }),
  );
}

/** A short-lived link to a comment's attachment. */
export async function partnerCommentAttachmentUrl(partnerId: string, groupId: string, commentId: string, fileVersionId: string): Promise<string> {
  return urlOf(
    await partnerApi.GET("/partner-portal/partners/{partnerId}/jobs/{groupId}/comments/{commentId}/attachments/{fileVersionId}/url", {
      params: { path: { partnerId, groupId, commentId, fileVersionId } },
    }),
  );
}
