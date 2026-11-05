import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { useOrderCounts, useOrdersList, useTileOrders } from "./queries";
import { DEFAULT_VIEW } from "./view";

let urls: URL[] = [];
beforeEach(() => {
  urls = [];
  server.events.on("request:start", ({ request }) => urls.push(new URL(request.url)));
});
afterEach(() => server.events.removeAllListeners());

describe("orders queries", () => {
  it("pages the list with the view's filters and the tab's default sort", async () => {
    const { result } = renderHookAs(STAFF, () => useOrdersList({ ...DEFAULT_VIEW, tab: "ready" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.items.map((o) => o.number)).toEqual([1042, 1043, 1044]);
    const list = urls.find((u) => u.pathname === "/orders")!;
    expect(Object.fromEntries(list.searchParams)).toEqual({ state: "ready", sort: "promised_on", limit: "50" });
  });

  it("counts with the filters it is given", async () => {
    const { result } = renderHookAs(STAFF, () => useOrderCounts({ q: "luna" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.all).toBe(2);
  });

  it("reads the first few orders for a tile", async () => {
    const { result } = renderHookAs(STAFF, () => useTileOrders("late", 1));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((o) => o.number)).toEqual([1041]);
  });

  it("throws the problem on a 400", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/orders`, () =>
        HttpResponse.json(
          { type: "urn:problem:validation", title: "Validation failed", status: 400, errors: [{ path: "cursor", message: "Invalid cursor" }] },
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    const { result } = renderHookAs(STAFF, () => useOrdersList(DEFAULT_VIEW));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 400, errors: [{ path: "cursor" }] });
  });
});
