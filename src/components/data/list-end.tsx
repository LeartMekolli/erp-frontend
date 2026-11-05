"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

/** The next page loads when the list's end comes this close to the viewport. */
const AHEAD = "0px 0px 400px 0px";

interface ListState {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  pageCount: number;
  fetchNextPage: () => unknown;
}

/**
 * The end of a cursor list: loads the next page as it scrolls into view, with a
 * button that does the same for keyboard and screen-reader users.
 */
export function ListEnd({ list }: { list: ListState }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = list;
  const canLoad = hasNextPage && !isFetchingNextPage && !isFetchNextPageError;

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !canLoad || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) fetchNextPage();
      },
      { rootMargin: AHEAD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [canLoad, fetchNextPage]);

  if (isFetchNextPageError) {
    return (
      <div className="flex flex-col items-start gap-2 py-4">
        <p className="text-sm text-ink-2">More couldn&apos;t be loaded.</p>
        <Button variant="secondary" onClick={() => fetchNextPage()}>
          Try again
        </Button>
      </div>
    );
  }

  if (hasNextPage) {
    return (
      <div ref={sentinel} className="flex justify-center py-4">
        <Button
          variant="secondary"
          disabled={isFetchingNextPage}
          aria-busy={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading more…" : "Show more"}
        </Button>
      </div>
    );
  }

  if (list.pageCount > 1) return <p className="py-4 text-center text-sm text-ink-2">That&apos;s everything.</p>;
  return null;
}
