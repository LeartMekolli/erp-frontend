import { act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useCustomer } from "@/lib/new-order/queries";

import { FAKE_API_URL, LUNA_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { useCustomerAddressBook, useCustomerOrders, useCustomersList, useSetAddresses, useUpdateCustomer } from "./queries";
import { DEFAULT_CUSTOMERS_VIEW, type CustomersView } from "./view";

let urls: URL[] = [];
beforeEach(() => {
  urls = [];
  server.events.on("request:start", ({ request }) => urls.push(new URL(request.url)));
});
afterEach(() => server.events.removeAllListeners());

const listReads = () => urls.filter((url) => url.pathname === "/customers");

describe("customer queries", () => {
  it("asks for active customers, 50 a page, by default", async () => {
    const { result } = renderHookAs(STAFF, () => useCustomersList(DEFAULT_CUSTOMERS_VIEW));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Object.fromEntries(listReads()[0]!.searchParams)).toEqual({ status: "active", limit: "50" });
    expect(result.current.items.map((customer) => customer.name)).not.toContain("Old Works");
  });

  it("starts again from the first page, with no cursor, when the view changes after Show more", async () => {
    const page = fakeState().catalog.list(new URLSearchParams());
    if (!page.ok) throw new Error("no customers");
    // Two pages whatever is asked, so Show more has something to load.
    server.use(
      http.get(`${FAKE_API_URL}/customers`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(cursor ? { data: page.body.data.slice(5), next_cursor: null } : { data: page.body.data.slice(0, 5), next_cursor: "5" });
      }),
    );
    let view: CustomersView = DEFAULT_CUSTOMERS_VIEW;
    const { result, rerender } = renderHookAs(STAFF, () => useCustomersList(view));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(() => result.current.fetchNextPage());
    expect(listReads().at(-1)!.searchParams.get("cursor")).toBe("5");

    view = { ...DEFAULT_CUSTOMERS_VIEW, q: "mira" };
    rerender();
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    const last = listReads().at(-1)!;
    expect(last.searchParams.get("q")).toBe("mira");
    expect(last.searchParams.has("cursor")).toBe(false);
  });

  it("reads the customer's orders newest placed first, 10 a page", async () => {
    const { result } = renderHookAs(STAFF, () => useCustomerOrders(LUNA_ID, true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const asked = urls.find((url) => url.pathname === "/orders")!;
    expect(Object.fromEntries(asked.searchParams)).toEqual({ customer_id: LUNA_ID, sort: "-placed_at", limit: "10" });
    expect(result.current.items.map((order) => order.number)).toEqual([1048, 1042]);
  });

  it("reads the new addresses after a change", async () => {
    const { result } = renderHookAs(STAFF, () => ({ book: useCustomerAddressBook(LUNA_ID), set: useSetAddresses(LUNA_ID) }));
    await waitFor(() => expect(result.current.book.isSuccess).toBe(true));
    await act(() => result.current.set.mutateAsync({ vat_number: "FR11" }));
    await waitFor(() => expect(result.current.book.data?.vat_number).toBe("FR11"));
    expect(result.current.book.data?.shipping_address?.city).toBe("Lyon");
  });

  it("refreshes New order's copy of the customer after a change", async () => {
    const { result } = renderHookAs(STAFF, () => ({ newOrder: useCustomer(LUNA_ID), update: useUpdateCustomer(LUNA_ID) }));
    await waitFor(() => expect(result.current.newOrder.isSuccess).toBe(true));
    await act(() => result.current.update.mutateAsync({ name: "Luna Atelier" }));
    await waitFor(() => expect(result.current.newOrder.data?.name).toBe("Luna Atelier"));
  });
});
