"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { FeedEntry } from "@/lib/api/schema-types";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList } from "@/lib/query/use-cursor-list";

const notificationsKeys = {
  all: ["notifications"] as const,
  unread: ["notifications", "unread"] as const,
  feed: ["notifications", "feed"] as const,
};

async function fetchFeed(query: { limit: number; cursor?: string; unread?: "true" }) {
  const { data, error, response } = await api.GET("/notifications", { params: { query } });
  if (!data) throw problemFrom(error, response);
  return data;
}

/**
 * Whether anything is unread. erp-api has no unread count yet
 * (`backend-todos.md`), so one unread entry is enough to show the dot.
 * Refreshes with the app's every-minute refetch.
 */
export function useUnreadDot(): boolean {
  const query = useQuery({
    queryKey: notificationsKeys.unread,
    queryFn: async () => (await fetchFeed({ unread: "true", limit: 1 })).data.length > 0,
  });
  return query.data ?? false;
}

/** The signed-in person's notifications, newest first, 20 at a time. */
export function useFeed(enabled = true) {
  return useCursorList<FeedEntry>({
    queryKey: notificationsKeys.feed,
    fetchPage: (cursor) => fetchFeed(cursor ? { limit: 20, cursor } : { limit: 20 }),
    enabled,
  });
}

/** Marks one notification read; the dot and the list fetch again. */
export function useMarkRead() {
  const client = useQueryClient();
  return useApiMutation<string, void>(
    async (id, key) => {
      const { error, response } = await api.POST("/notifications/{id}/read", {
        params: { path: { id }, header: idempotencyHeader(key) },
      });
      if (!response.ok) throw problemFrom(error, response);
    },
    { onSettled: () => client.invalidateQueries({ queryKey: notificationsKeys.all }) },
  );
}
