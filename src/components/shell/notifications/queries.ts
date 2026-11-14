"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { notificationsApi } from "@/lib/api/client";
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

async function fetchFeed(query: { limit: number; cursor?: string }) {
  const { data, error, response } = await notificationsApi.GET("/notifications", { params: { query } });
  if (!data) throw problemFrom(error, response);
  return data;
}

/**
 * How many notifications are unread; 0 while loading or on error.
 * Refreshes with the app's every-minute refetch.
 */
export function useUnreadCount(): number {
  const query = useQuery({
    queryKey: notificationsKeys.unread,
    queryFn: async () => {
      const { data, error, response } = await notificationsApi.GET("/notifications/unread-count");
      if (!data) throw problemFrom(error, response);
      return data.count;
    },
  });
  return query.data ?? 0;
}

/** The signed-in person's notifications, newest first, 20 at a time. */
export function useFeed(enabled = true) {
  return useCursorList<FeedEntry>({
    queryKey: notificationsKeys.feed,
    fetchPage: (cursor) => fetchFeed(cursor ? { limit: 20, cursor } : { limit: 20 }),
    enabled,
  });
}

/** Marks one notification read; the count and the list fetch again. */
export function useMarkRead() {
  const client = useQueryClient();
  return useApiMutation<string, void>(
    async (id, key) => {
      const { error, response } = await notificationsApi.POST("/notifications/{id}/read", {
        params: { path: { id }, header: idempotencyHeader(key) },
      });
      if (!response.ok) throw problemFrom(error, response);
    },
    { onSettled: () => client.invalidateQueries({ queryKey: notificationsKeys.all }) },
  );
}

/** Marks every notification read; the count and the list fetch again. */
export function useMarkAllRead() {
  const client = useQueryClient();
  return useApiMutation<void, void>(
    async (_, key) => {
      const { error, response } = await notificationsApi.POST("/notifications/read-all", {
        params: { header: idempotencyHeader(key) },
      });
      if (!response.ok) throw problemFrom(error, response);
    },
    { onSettled: () => client.invalidateQueries({ queryKey: notificationsKeys.all }) },
  );
}
