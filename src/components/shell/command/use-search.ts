"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/** erp-api's limit on `q` (`search-response.ts:3`). */
export const MAX_SEARCH_LENGTH = 100;

/**
 * What to send as `q`: trimmed, and an order typed as `#1041` sent as its
 * digits, since erp-api matches orders only by the start of their number.
 */
export function searchText(text: string): string {
  const trimmed = text.trim();
  return /^#\d+$/.test(trimmed) ? trimmed.slice(1) : trimmed;
}

/**
 * ⌘K's search for `text`, 200 ms after typing stops. Each text has its own
 * cache entry, so a slow answer to older text never replaces a newer one;
 * the last answer stays on screen while the next one loads.
 */
export function useSearch(text: string) {
  const q = useDebouncedValue(searchText(text), 200);
  const query = useQuery({
    queryKey: ["search", q],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/search", { params: { query: { q } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    enabled: q.length > 0 && q.length <= MAX_SEARCH_LENGTH,
    placeholderData: keepPreviousData,
    refetchInterval: false,
  });
  return { ...query, q, settled: q === searchText(text) && !query.isPlaceholderData };
}
