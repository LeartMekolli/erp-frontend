"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotent } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { Group, MoveBody, MoveResponse, WorkOrderDetail, WorkOrderListItem, WorkflowVersion } from "@/lib/api/schema-types";
import { downloadUrl } from "@/lib/files/download";
import { invalidateOrders } from "@/lib/orders/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList } from "@/lib/query/use-cursor-list";

/** The pieces a step group can list: active ones at a step, or those off the path. */
export type PieceListStatus = "active" | "finished" | "scrapped";

const PIECES_PAGE = 200;
const PHOTO_LINK_RENEW_MS = 4 * 60_000;

export const productionKeys = {
  all: ["production"] as const,
  group: (id: string) => ["production", "group", id] as const,
  pieces: (groupId: string, stepKey: string | null, status: PieceListStatus) => ["production", "pieces", groupId, stepKey, status] as const,
  version: (workflowId: string, version: number) => ["production", "version", workflowId, version] as const,
  piece: (id: string) => ["production", "piece", id] as const,
  photo: (versionId: string) => ["production", "photo", versionId] as const,
};

/** A line's path, with how many pieces are at each step. */
export function useGroup(id: string, enabled: boolean) {
  return useQuery({
    queryKey: productionKeys.group(id),
    queryFn: async (): Promise<Group> => {
      const { data, error, response } = await api.GET("/workflow/groups/{id}", { params: { path: { id } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
  });
}

/** One step's pieces, or the finished or scrapped ones when `stepKey` is null. */
export function useStepPieces(groupId: string, stepKey: string | null, status: PieceListStatus, enabled: boolean) {
  return useCursorList<WorkOrderListItem>({
    queryKey: productionKeys.pieces(groupId, stepKey, status),
    fetchPage: async (cursor) => {
      const query = {
        group_id: groupId,
        status,
        limit: PIECES_PAGE,
        ...(stepKey ? { step_key: stepKey } : {}),
        ...(cursor ? { cursor } : {}),
      };
      const { data, error, response } = await api.GET("/workflow/work-orders", { params: { query } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
  });
}

/** Each step's checklist, defects and evidence, as the group's pieces were started on. */
export function useWorkflowVersion(workflowId: string, version: number) {
  return useQuery({
    queryKey: productionKeys.version(workflowId, version),
    queryFn: async (): Promise<WorkflowVersion> => {
      const { data, error, response } = await api.GET("/workflow/workflows/{id}/versions/{number}", {
        params: { path: { id: workflowId, number: version } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** One piece, its path and every move it has made. */
export function usePiece(id: string) {
  return useQuery({
    queryKey: productionKeys.piece(id),
    queryFn: async (): Promise<WorkOrderDetail> => {
      const { data, error, response } = await api.GET("/workflow/work-orders/{id}", { params: { path: { id } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** A link to a QC photo, renewed while it's on screen before erp-api's five minutes run out (`files.service.ts:29`). */
export function usePhotoUrl(fileId: string, versionId: string) {
  return useQuery({
    queryKey: productionKeys.photo(versionId),
    queryFn: () => downloadUrl(fileId, versionId),
    staleTime: PHOTO_LINK_RENEW_MS,
    refetchInterval: PHOTO_LINK_RENEW_MS,
  });
}

/** Passes, fails or corrects pieces (`POST /workflow/moves`). Finished pieces can change the order's state, so both refresh. */
export function useMovePieces() {
  const client = useQueryClient();
  return useApiMutation<MoveBody, MoveResponse>(
    async (body, key) => {
      const { data, error, response } = await api.POST("/workflow/moves", { body, ...idempotent(key) });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => Promise.all([invalidateProduction(client), invalidateOrders(client)]) },
  );
}

/** After a move: every line's counts and pieces fetch again. */
export function invalidateProduction(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: productionKeys.all });
}
