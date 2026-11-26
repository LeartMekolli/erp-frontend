"use client";

import { useQueries, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type {
  Defect,
  Group,
  LineAction,
  MoveActor,
  MoveBody,
  MoveHistory,
  MoveListItem,
  MoveListQueryParams,
  MoveResponse,
  PieceSort,
  StepCounts,
  StepGroup,
  TransitionListItem,
  WorkOrderDetail,
  WorkOrderListItem,
  WorkflowSummary,
  WorkflowVersion,
} from "@/lib/api/schema-types";
import { invalidateOrders } from "@/lib/orders/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList, type Page } from "@/lib/query/use-cursor-list";

/** The pieces a step group can list: active ones at a step, or those off the path. */
export type PieceListStatus = "active" | "finished" | "scrapped";

/** A line's History: every action, or only fails and corrections that put pieces at a step. */
export type MovesFilter = "all" | "fails";

const PIECES_PAGE = 200;
const MOVES_PAGE = 25;

/** How often Production's counts and lines read again while the tab is visible: other people move pieces too. */
const REFRESH_MS = 30_000;
const LINES_PAGE = 50;

/** Which order lines By step lists: one workflow's step, searched, sorted, and only what the caller may work. */
export interface StepLinesFilter {
  workflowId: string;
  stepKey: string;
  q: string | null;
  sort: PieceSort;
  workable: boolean;
}

export const productionKeys = {
  all: ["production"] as const,
  workflows: () => ["production", "workflows"] as const,
  counts: (workflowId: string, workable: boolean, q: string | null) => ["production", "counts", workflowId, workable, q] as const,
  lines: (workflowId: string, stepKey: string, q: string | null, sort: PieceSort, workable: boolean) =>
    ["production", "lines", workflowId, stepKey, q, sort, workable] as const,
  group: (id: string) => ["production", "group", id] as const,
  pieces: (groupId: string, stepKey: string | null, status: PieceListStatus) => ["production", "pieces", groupId, stepKey, status] as const,
  moves: (groupId: string, filter: MovesFilter) => ["production", "moves", groupId, filter] as const,
  version: (workflowId: string, version: number) => ["production", "version", workflowId, version] as const,
  piece: (id: string) => ["production", "piece", id] as const,
  moveList: (query: MoveListQueryParams) => ["production", "move-list", query] as const,
  movePieces: (moveId: string, groupId: string) => ["production", "move-pieces", moveId, groupId] as const,
  defects: () => ["production", "defects"] as const,
  // Under Production, so someone's first move puts them in the Person filter.
  actors: (workflowId: string | null) => ["production", "actors", workflowId] as const,
};

const MOVE_LIST_PAGE = 50;
const MOVE_ROWS_PAGE = 200;

/**
 * History: every line's moves, newest first, `MOVE_LIST_PAGE` a page. The query is part of the key, so new
 * filters start again from the first page and never send a cursor made for other ones (erp-api refuses it).
 */
export function useMoveList(query: MoveListQueryParams) {
  return useCursorList<MoveListItem>({
    queryKey: productionKeys.moveList(query),
    fetchPage: async (cursor) => {
      const params = { ...query, limit: MOVE_LIST_PAGE, ...(cursor ? { cursor } : {}) };
      const { data, error, response } = await api.GET("/workflow/moves", { params: { query: params } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    refetchInterval: REFRESH_MS,
  });
}

/** The pieces one move moved on one line, read by erp-api's filters so nothing is grouped in the browser. */
export function useMoveRows(moveId: string, groupId: string, enabled: boolean) {
  return useCursorList<TransitionListItem>({
    queryKey: productionKeys.movePieces(moveId, groupId),
    fetchPage: async (cursor) => {
      const query = { move_id: moveId, group_id: groupId, limit: MOVE_ROWS_PAGE, ...(cursor ? { cursor } : {}) };
      const { data, error, response } = await api.GET("/workflow/transitions", { params: { query } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
  });
}

/** Every defect in the catalogue, by key, for History's Defect filter. */
export function useDefects() {
  return useQuery({
    queryKey: productionKeys.defects(),
    queryFn: async (): Promise<Defect[]> => {
      const { data, error, response } = await api.GET("/workflow/defects");
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
  });
}

/** Everyone who has moved pieces of the product type, staff and workshop people, by name. Nothing until one is picked. */
export function useMoveActors(workflowId: string | null) {
  return useQuery({
    queryKey: productionKeys.actors(workflowId),
    queryFn: async (): Promise<MoveActor[]> => {
      const { data, error, response } = await api.GET("/workflow/moves/actors", { params: { query: { workflow_id: workflowId! } } });
      if (!data) throw problemFrom(error, response);
      return data.items;
    },
    enabled: workflowId !== null,
  });
}

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

/** One page of a line's pieces at a step, or of its finished or scrapped ones when `stepKey` is null. */
async function piecesPage(groupId: string, stepKey: string | null, status: PieceListStatus, cursor: string | undefined): Promise<Page<WorkOrderListItem>> {
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
}

/** One step's pieces, or the finished or scrapped ones when `stepKey` is null. */
export function useStepPieces(groupId: string, stepKey: string | null, status: PieceListStatus, enabled: boolean) {
  return useCursorList<WorkOrderListItem>({
    queryKey: productionKeys.pieces(groupId, stepKey, status),
    fetchPage: (cursor) => piecesPage(groupId, stepKey, status, cursor),
    enabled,
  });
}

/**
 * Every active piece of a line at a step, page after page, so ticking a line takes all of it and not only its
 * first page. Kept under the same key `useStepPieces` reads, so opening the line afterwards shows them at once.
 */
export async function fetchLinePieces(client: QueryClient, groupId: string, stepKey: string): Promise<WorkOrderListItem[]> {
  const pages: Page<WorkOrderListItem>[] = [];
  const pageParams: (string | undefined)[] = [];
  let cursor: string | undefined;
  do {
    const page = await piecesPage(groupId, stepKey, "active", cursor);
    pages.push(page);
    pageParams.push(cursor);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  client.setQueryData<InfiniteData<Page<WorkOrderListItem>>>(productionKeys.pieces(groupId, stepKey, "active"), { pages, pageParams });
  return pages.flatMap((page) => page.data);
}

/** Every workflow (product type) with its current version. */
export function useWorkflows() {
  return useQuery({
    queryKey: productionKeys.workflows(),
    queryFn: async (): Promise<WorkflowSummary[]> => {
      const { data, error, response } = await api.GET("/workflow/workflows");
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
  });
}

/** The active pieces at each step, one query per workflow, so the busiest workflow can be picked from them all. */
export function useWorkflowCounts(workflowIds: string[], workable: boolean, q: string | null) {
  const client = useQueryClient();
  return useQueries({
    queries: workflowIds.map((workflowId) => ({
      queryKey: productionKeys.counts(workflowId, workable, q),
      queryFn: async (): Promise<StepCounts> => {
        const query = { workflow_id: workflowId, ...(workable ? { workable: "true" as const } : {}), ...(q ? { q } : {}) };
        const { data, error, response } = await api.GET("/workflow/work-orders/counts", { params: { query } });
        if (!data) throw problemFrom(error, response);
        return data;
      },
      refetchInterval: REFRESH_MS,
      // A new search or "Only what I can work" keeps the step tabs on the latest counts until the new ones arrive.
      // `keepPreviousData` can't: `useQueries` gives a changed key a new observer, with nothing previous.
      placeholderData: () => latestCounts(client, workflowId),
    })),
  });
}

/** The counts most recently loaded for a workflow, whatever their search or filter. */
function latestCounts(client: QueryClient, workflowId: string): StepCounts | undefined {
  const loaded = client
    .getQueryCache()
    .findAll({ queryKey: ["production", "counts", workflowId] })
    .filter((query) => query.state.data !== undefined)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  return loaded[0]?.state.data as StepCounts | undefined;
}

/** The order lines at one step, `LINES_PAGE` a page, each with how many of its pieces wait there. */
export function useStepLines(filter: StepLinesFilter, enabled: boolean) {
  const { workflowId, stepKey, q, sort, workable } = filter;
  return useCursorList<StepGroup>({
    queryKey: productionKeys.lines(workflowId, stepKey, q, sort, workable),
    fetchPage: async (cursor) => {
      const query = {
        workflow_id: workflowId,
        step_key: stepKey,
        sort,
        limit: LINES_PAGE,
        ...(workable ? { workable: "true" as const } : {}),
        ...(q ? { q } : {}),
        ...(cursor ? { cursor } : {}),
      };
      const { data, error, response } = await api.GET("/workflow/work-orders/groups", { params: { query } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
    refetchInterval: REFRESH_MS,
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

/** A workflow version's query, for the hook below and for reading it outside a render (`client.fetchQuery`). */
export function workflowVersionQuery(workflowId: string, version: number) {
  return {
    queryKey: productionKeys.version(workflowId, version),
    queryFn: async (): Promise<WorkflowVersion> => {
      const { data, error, response } = await api.GET("/workflow/workflows/{id}/versions/{number}", {
        params: { path: { id: workflowId, number: version } },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  };
}

/** Each step's checklist, defects and evidence, as the group's pieces were started on. */
export function useWorkflowVersion(workflowId: string, version: number, enabled = true) {
  return useQuery({ ...workflowVersionQuery(workflowId, version), enabled });
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

/**
 * Sends a move held on the Board with the key it was given when held, then refreshes Production and Orders.
 * With `keepalive` the request outlives the page, for a tab closed while the move waited.
 */
export async function sendMoveNow(client: QueryClient, body: MoveBody, key: string, { keepalive }: { keepalive: boolean }): Promise<MoveResponse> {
  try {
    const { data, error, response } = await api.POST("/workflow/moves", {
      body,
      params: { header: idempotencyHeader(key) },
      ...(keepalive ? { fetch: (request: Request) => fetch(new Request(request, { keepalive: true })) } : {}),
    });
    if (!data) throw problemFrom(error, response);
    return data;
  } finally {
    void Promise.all([invalidateProduction(client), invalidateOrders(client)]);
  }
}

/** After a move: every line's counts and pieces fetch again. */
export function invalidateProduction(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: productionKeys.all });
}
