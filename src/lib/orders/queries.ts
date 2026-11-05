"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";
import type { Order, OrderCountsQuery, OrderListQuery } from "@/lib/api/schema-types";
import { useCursorList } from "@/lib/query/use-cursor-list";

import { listQuery, type OrdersView } from "./view";

export const ordersKeys = {
  all: ["orders"] as const,
  list: (query: OrderListQuery) => ["orders", "list", query] as const,
  counts: (query: OrderCountsQuery) => ["orders", "counts", query] as const,
  tile: (reason: string, limit: number) => ["orders", "tile", reason, limit] as const,
};

async function fetchOrders(query: OrderListQuery) {
  const { data, error, response } = await api.GET("/orders", { params: { query } });
  if (!data) throw problemFrom(error, response);
  return data;
}

/** The Orders list for a view, a page of 50 at a time. */
export function useOrdersList(view: OrdersView) {
  const query = listQuery(view);
  return useCursorList<Order>({
    queryKey: ordersKeys.list(query),
    fetchPage: (cursor) => fetchOrders(cursor ? { ...query, cursor } : query),
  });
}

/** How many orders each tab and reason holds, with these filters. */
export function useOrderCounts(query: OrderCountsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: ordersKeys.counts(query),
    queryFn: async () => {
      const { data, error, response } = await api.GET("/orders/counts", { params: { query } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled,
  });
}

/** The first few orders with one reason, soonest promised first, for a tile. */
export function useTileOrders(reason: "to_ship" | "late", limit: number) {
  return useQuery({
    queryKey: ordersKeys.tile(reason, limit),
    queryFn: async () => (await fetchOrders({ needs: reason, sort: "promised_on", limit })).data,
  });
}

/** After a change to any order: the list, counts and tiles fetch again. */
export function invalidateOrders(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: ordersKeys.all });
}
