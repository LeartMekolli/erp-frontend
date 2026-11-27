import { act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreatedCustomer, SentInvitation } from "@/lib/api/schema-types";
import { useCustomer } from "@/lib/new-order/queries";

import { FAKE_API_URL, LUNA_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import {
  customersKeys,
  useCreateCustomer,
  useCustomerAddressBook,
  useCustomerOrders,
  useCustomersList,
  useNameTaken,
  useSendInvitation,
  useSetAddresses,
  useUpdateCustomer,
} from "./queries";
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

  it("finds a customer with the same name, in any case, and only the settled name", async () => {
    let name = "Luna jewels";
    const { result, rerender, client } = renderHookAs(STAFF, () => useNameTaken(name));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.name).toBe("Luna Jewels"));
    expect(Object.fromEntries(listReads().at(-1)!.searchParams)).toEqual({ name: "Luna jewels", limit: "1" });

    // Typing on: the old answer is gone at once, and a name that is only part of a customer's isn't taken.
    name = "Luna";
    rerender();
    expect(result.current).toBeNull();
    // Only once the "Luna" answer is in does null prove that it isn't taken.
    await waitFor(() => expect(client.getQueryState(customersKeys.nameTaken("Luna"))?.status).toBe("success"));
    expect(Object.fromEntries(listReads().at(-1)!.searchParams)).toEqual({ name: "Luna", limit: "1" });
    expect(result.current).toBeNull();
  });

  it("finds an older customer with the same name past newer ones that only start with it", async () => {
    fakeState().catalog.create({ name: "Luna Jewels Atelier" }, null, "staff-1");
    fakeState().catalog.create({ name: "Luna Jewels Studio" }, null, "staff-1");
    const { result } = renderHookAs(STAFF, () => useNameTaken("LUNA JEWELS"));
    await waitFor(() => expect(result.current?.id).toBe(LUNA_ID));
  });

  it("asks nothing once the name is typed back to one character", async () => {
    let name = "Lu";
    const { result, rerender, client } = renderHookAs(STAFF, () => useNameTaken(name));
    await waitFor(() => expect(client.getQueryState(customersKeys.nameTaken("Lu"))?.status).toBe("success"));
    const reads = listReads().length;

    // Only the debounce's timers are faked, so its 400 ms pass at once and nothing else is held up.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      name = "L";
      rerender();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      // A check that had started would be fetching now; it never is, and nothing more was read.
      expect(client.getQueryState(customersKeys.nameTaken("L"))?.fetchStatus ?? "idle").toBe("idle");
      expect(client.isFetching()).toBe(0);
      expect(listReads()).toHaveLength(reads);
      expect(result.current).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks a name of 101 to 200 characters too", async () => {
    const long = `${"Luna Jewels ".repeat(9)}Atelier`; // 115 characters
    const created = fakeState().catalog.create({ name: long }, null, "staff-1");
    if (!created.ok) throw new Error("not created");
    const { result } = renderHookAs(STAFF, () => useNameTaken(long));
    await waitFor(() => expect(result.current?.id).toBe(created.body.id));
    expect(listReads().at(-1)!.searchParams.get("name")).toBe(long);
  });

  it("creates with an Idempotency-Key and refreshes customers and the search", async () => {
    const keys: (string | null)[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname === "/customers") keys.push(request.headers.get("idempotency-key"));
    });
    const { result, client } = renderHookAs(STAFF, () => ({ list: useCustomersList(DEFAULT_CUSTOMERS_VIEW), create: useCreateCustomer() }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    client.setQueryData(["search", "atelier"], { customers: [] });

    let created: CreatedCustomer | undefined;
    await act(async () => {
      created = await result.current.create.mutateAsync({ name: "Atelier Nord", invitation: { email: "sofia@atelier.example", role: "owner" } });
    });

    expect(created?.name).toBe("Atelier Nord");
    expect(created?.invitation).toMatchObject({ email: "sofia@atelier.example", role: "owner", email_status: "queued" });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBeTruthy();
    await waitFor(() => expect(result.current.list.items[0]?.name).toBe("Atelier Nord"));
    expect(client.getQueryState(["search", "atelier"])?.isInvalidated).toBe(true);
    expect(fakeState().catalog.invitations()).toEqual([{ customerId: created!.id, email: "sofia@atelier.example", role: "owner" }]);
  });

  it("sends an invitation with an Idempotency-Key and answers what became of its email", async () => {
    const keys: (string | null)[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname === `/customers/${LUNA_ID}/invitations`) keys.push(request.headers.get("idempotency-key"));
    });
    fakeState().catalog.setInvitationEmail("no_customer_site");
    const { result } = renderHookAs(STAFF, () => useSendInvitation(LUNA_ID));

    let sent: SentInvitation | undefined;
    await act(async () => {
      sent = await result.current.mutateAsync({ email: "sofia@atelier.example", role: "owner" });
    });

    expect(sent).toMatchObject({ email: "sofia@atelier.example", role: "owner", email_status: "no_customer_site" });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBeTruthy();
    expect(fakeState().catalog.invitations()).toEqual([{ customerId: LUNA_ID, email: "sofia@atelier.example", role: "owner" }]);
  });

  it("refreshes New order's copy of the customer after a change", async () => {
    const { result } = renderHookAs(STAFF, () => ({ newOrder: useCustomer(LUNA_ID), update: useUpdateCustomer(LUNA_ID) }));
    await waitFor(() => expect(result.current.newOrder.isSuccess).toBe(true));
    await act(() => result.current.update.mutateAsync({ name: "Luna Atelier" }));
    await waitFor(() => expect(result.current.newOrder.data?.name).toBe("Luna Atelier"));
  });
});
