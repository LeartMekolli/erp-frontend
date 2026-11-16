"use client";

import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { PlaceOrderBody, QuoteBody, QuoteResult } from "@/lib/api/schema-types";
import { ordersKeys } from "@/lib/orders/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";

/** Prices a configuration: a saved quote (201) or every reason it can't be priced (200); both resolve. */
export function useGetQuote() {
  return useApiMutation<QuoteBody, QuoteResult>(async (body, key) => {
    const { data, error, response } = await api.POST("/pricing/quotes", { body, params: { header: idempotencyHeader(key) } });
    if (!data) throw problemFrom(error, response);
    return data;
  });
}

/** Places the order; the Orders list and counts fetch again. */
export function usePlaceOrder() {
  const client = useQueryClient();
  return useApiMutation<PlaceOrderBody, { id: string }>(
    async (body, key) => {
      const { data, error, response } = await api.POST("/orders", { body, params: { header: idempotencyHeader(key) } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSuccess: () => client.invalidateQueries({ queryKey: ordersKeys.all }) },
  );
}
