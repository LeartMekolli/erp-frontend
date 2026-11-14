"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { Claim, OrderComment, StaffCommentBody } from "@/lib/api/schema-types";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { useCursorList } from "@/lib/query/use-cursor-list";

import { invalidateOrders } from "./queries";

const commentKey = (orderId: string) => ["orders", "comments", orderId] as const;
const claimsKey = (orderId: string) => ["orders", "claims", orderId] as const;

/** One order's claims can't be many: a single page holds them. */
const CLAIMS_PAGE = 200;

/** An order's comments, oldest first, a page at a time. */
export function useOrderComments(orderId: string) {
  return useCursorList<OrderComment>({
    queryKey: commentKey(orderId),
    fetchPage: async (cursor) => {
      const { data, error, response } = await api.GET("/orders/{id}/comments", {
        params: { path: { id: orderId }, query: cursor ? { cursor } : {} },
      });
      if (!data) throw problemFrom(error, response);
      return data;
    },
  });
}

/** Adds a comment to the order or one of its lines. The line decides who reads it; there's no reader to pick. */
export function usePostComment(orderId: string) {
  const client = useQueryClient();
  return useApiMutation<StaffCommentBody, OrderComment>(
    async (body, key) => {
      const { data, error, response } = await api.POST("/orders/{id}/comments", { params: { path: { id: orderId }, header: idempotencyHeader(key) }, body });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => invalidateOrders(client) },
  );
}

/** A short-lived link to a comment's attachment. */
export async function commentAttachmentUrl(orderId: string, commentId: string, fileVersionId: string): Promise<string> {
  const { data, error, response } = await api.GET("/orders/{id}/comments/{commentId}/attachments/{fileVersionId}/url", {
    params: { path: { id: orderId, commentId, fileVersionId } },
  });
  if (!data) throw problemFrom(error, response);
  return data.url;
}

/** One order's claims. */
export function useOrderClaims(orderId: string) {
  return useQuery({
    queryKey: claimsKey(orderId),
    queryFn: async (): Promise<Claim[]> => {
      const { data, error, response } = await api.GET("/claims", { params: { query: { order_id: orderId, limit: CLAIMS_PAGE } } });
      if (!data) throw problemFrom(error, response);
      return data.data;
    },
  });
}
