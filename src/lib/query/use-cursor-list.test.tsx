import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { FAKE_API_URL } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";

import { useCursorList, type Page } from "./use-cursor-list";

type Row = { id: string };

const PAGES: Record<string, Page<Row>> = {
  first: { data: [{ id: "a" }, { id: "b" }], next_cursor: "c1" },
  c1: { data: [{ id: "c" }, { id: "d" }], next_cursor: "c2" },
  c2: { data: [{ id: "e" }], next_cursor: null },
};

function serve(failCursor?: string) {
  const cursors: (string | null)[] = [];
  server.use(
    http.get(`${FAKE_API_URL}/orders`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      cursors.push(cursor);
      if (cursor === failCursor) return HttpResponse.json({}, { status: 500 });
      return HttpResponse.json(PAGES[cursor ?? "first"]);
    }),
  );
  return cursors;
}

async function fetchPage(cursor: string | undefined): Promise<Page<Row>> {
  const url = new URL(`${FAKE_API_URL}/orders`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`orders answered ${response.status}`);
  return (await response.json()) as Page<Row>;
}

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCursorList({ queryKey: ["orders"], fetchPage }), { wrapper });
}

describe("useCursorList", () => {
  it("pages through with next_cursor and stops at null", async () => {
    const cursors = serve();
    const { result } = renderList();
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(() => result.current.fetchNextPage());
    await act(() => result.current.fetchNextPage());
    expect(result.current.items.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.pageCount).toBe(3);
    expect(cursors).toEqual([null, "c1", "c2"]);
  });

  it("keeps loaded pages when the next one fails", async () => {
    serve("c1");
    const { result } = renderList();
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(() => result.current.fetchNextPage());
    expect(result.current.items.map((row) => row.id)).toEqual(["a", "b"]);
    expect(result.current.isFetchNextPageError).toBe(true);
  });
});
