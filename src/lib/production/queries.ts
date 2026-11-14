"use client";

import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type {
  Group,
  LineAction,
  MoveBody,
  MoveHistory,
  MoveResponse,
  WorkOrderDetail,
  WorkOrderListItem,
  WorkflowVersion,
} from "@/lib/api/schema-types";
import { invalidateOrders } from "@/lib/orders/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList } from "@/lib/query/use-cursor-list";

/** The pieces a step group can list: active ones at a step, or those off the path. */
export type PieceListStatus = "active" | "finished" | "scrapped";

/** A line's History: every action, or only fails and corrections that put pieces at a step. */
export type MovesFilter = "all" | "fails";

const PIECES_PAGE = 200;
const MOVES_PAGE = 25;

export const productionKeys = {
  all: ["production"] as const,
  group: (id: string) => ["production", "group", id] as const,
  pieces: (groupId: string, stepKey: string | null, status: PieceListStatus) => ["production", "pieces", groupId, stepKey, status] as const,
  moves: (groupId: string, filter: MovesFilter) => ["production", "moves", groupId, filter] as const,
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

/**
 * A line's moves, one item per action, newest first. `counts` covers every page whatever the filter, so
 * while one filter loads its counts come from the other's cached list.
 */
export function useLineMoves(groupId: string, filter: MovesFilter) {
  const client = useQueryClient();
  const list = useCursorList<LineAction, MoveHistory>({
    queryKey: productionKeys.moves(groupId, filter),
    fetchPage: async (cursor) => {
      const query = { limit: MOVES_PAGE, ...(filter === "fails" ? { only: "fails" as const } : {}), ...(cursor ? { cursor } : {}) };
      const { data, error, response } = await api.GET("/workflow/groups/{id}/moves", { params: { path: { id: groupId }, query } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
  const other = client.getQueryData<InfiniteData<MoveHistory>>(productionKeys.moves(groupId, filter === "all" ? "fails" : "all"));
  return { ...list, counts: list.data?.pages[0]?.counts ?? other?.pages[0]?.counts ?? null };
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

/**
 * Passes, fails or corrects pieces (`POST /workflow/moves`). Finished pieces can change the order's state, so both refresh.
 * The refresh isn't awaited: the caller clears its selection first, or the moved pieces would read as taken by someone else.
 */
export function useMovePieces() {
  const client = useQueryClient();
  return useApiMutation<MoveBody, MoveResponse>(
    async (body, key) => {
      const { data, error, response } = await api.POST("/workflow/moves", { body, params: { header: idempotencyHeader(key) } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    {
      onSettled: () => {
        void Promise.all([invalidateProduction(client), invalidateOrders(client)]);
      },
    },
  );
}

/** After a move: every line's counts and pieces fetch again. */
export function invalidateProduction(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: productionKeys.all });
}
