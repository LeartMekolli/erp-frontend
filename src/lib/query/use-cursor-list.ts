"use client";

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";

/** erp-api's list page (ADR 0004 §2): cursors only, `null` on the last page. */
export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

/**
 * A cursor-paged erp-api list. `fetchPage` gets the cursor (undefined for the
 * first page) and throws on a failed response. `items` is every loaded page
 * in order.
 */
export function useCursorList<T>(options: {
  queryKey: QueryKey;
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>;
  enabled?: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey: options.queryKey,
    queryFn: ({ pageParam }) => options.fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<T>) => last.next_cursor ?? undefined,
    enabled: options.enabled,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.data) ?? [],
    pageCount: query.data?.pages.length ?? 0,
  };
}
