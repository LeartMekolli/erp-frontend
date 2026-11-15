"use client";

import { useInfiniteQuery, type InfiniteData, type QueryKey } from "@tanstack/react-query";

/** erp-api's list page (ADR 0004 §2): cursors only, `null` on the last page. */
export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

/**
 * A cursor-paged erp-api list. `fetchPage` gets the cursor (undefined for the
 * first page) and throws on a failed response. `items` is every loaded page
 * in order. `P` keeps what a page carries besides its items, such as counts.
 * Name `T`: it can't be inferred once `P` is. `refetchInterval` re-reads
 * every loaded page that often, or as often as a function of them says.
 */
export function useCursorList<T, P extends Page<T> = Page<T>>(options: {
  queryKey: QueryKey;
  fetchPage: (cursor: string | undefined) => Promise<P>;
  enabled?: boolean;
  refetchInterval?: number | false | ((data: InfiniteData<P> | undefined) => number | false);
}) {
  const { refetchInterval } = options;
  const query = useInfiniteQuery({
    queryKey: options.queryKey,
    queryFn: ({ pageParam }) => options.fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: P) => last.next_cursor ?? undefined,
    enabled: options.enabled,
    refetchInterval: typeof refetchInterval === "function" ? (query) => refetchInterval(query.state.data) : refetchInterval,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.data) ?? [],
    pageCount: query.data?.pages.length ?? 0,
  };
}
