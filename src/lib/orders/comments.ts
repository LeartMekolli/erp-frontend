"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { isApiProblem, problemFrom } from "@/lib/api/problem";
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

/** Who reads a comment besides staff: the partner holding its line, or null for staff alone. */
export type CommentReader = OrderComment["partner"];

/**
 * The partner who would read a comment now, when erp-api refused it because
 * that isn't who the box said (`readers_changed`, erp-api
 * `orders/comments.service.ts:132`); undefined for any other failure.
 */
export function readersChanged(error: unknown): CommentReader | undefined {
  if (!isApiProblem(error) || error.status !== 409 || error.code !== "readers_changed") return undefined;
  const partner = error.partner as { id?: unknown; name?: unknown } | null | undefined;
  return partner && typeof partner.id === "string" && typeof partner.name === "string" ? { id: partner.id, name: partner.name } : null;
}

/**
 * Adds a comment to the order or one of its lines. The line decides who reads
 * it; `readers` says who the box told staff would, so erp-api refuses it when
 * that has changed meanwhile.
 */
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
