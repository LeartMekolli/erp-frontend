"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";
import type { Group, WorkOrderDetail, WorkOrderListItem, WorkflowVersion } from "@/lib/api/schema-types";
import { useCursorList } from "@/lib/query/use-cursor-list";

/** The pieces a step group can list: active ones at a step, or those off the path. */
export type PieceListStatus = "active" | "finished" | "scrapped";

const PIECES_PAGE = 200;

export const productionKeys = {
  all: ["production"] as const,
  group: (id: string) => ["production", "group", id] as const,
  pieces: (groupId: string, stepKey: string | null, status: PieceListStatus) => ["production", "pieces", groupId, stepKey, status] as const,
  version: (workflowId: string, version: number) => ["production", "version", workflowId, version] as const,
  piece: (id: string) => ["production", "piece", id] as const,
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

/** After a move: every line's counts and pieces fetch again. */
export function invalidateProduction(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: productionKeys.all });
}
