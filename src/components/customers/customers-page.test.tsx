import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setScreenWidth } from "../../../test/media";
import { CLERK, FAKE_API_URL, LUNA_ID, SALES_LEAD, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { CustomersPage } from "./customers-page";

const navigation = vi.hoisted(() => ({ notFound: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
  usePathname: () => "/customers",
  notFound: navigation.notFound,
}));

let lists: URL[] = [];
beforeEach(() => {
  navigation.notFound.mockReset();
  navigation.push.mockReset();
  lists = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === "/customers") lists.push(url);
  });
  setScreenWidth(1280);
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.unstubAllGlobals();
});

const FAILED = (status: number) => HttpResponse.json({ type: "about:blank", title: "Error", status }, { status });

const row = (name: string) => screen.getByRole("link", { name }).closest("tr")!;

describe("CustomersPage", () => {
  it("lists active customers with their group, band, plan, terms and status", async () => {
    renderAs(STAFF, <CustomersPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Customers" })).toBeInTheDocument();

    const luna = await screen.findByRole("link", { name: "Luna Jewels" });
    expect(luna).toHaveAttribute("href", `/customers/${LUNA_ID}`);
    for (const text of ["Trade", "Standard", "Free", "Pay first", "Active"]) expect(within(row("Luna Jewels")).getAllByText(text).length).toBeGreaterThan(0);
    expect(within(row("Pinewood Instruments")).getAllByText("Pay later · 30 days").length).toBeGreaterThan(0);
    expect(within(row("Pinewood Instruments")).getAllByText("No group").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Old Works" })).not.toBeInTheDocument();
  });

  it("opens a customer from anywhere on the row", async () => {
    renderAs(STAFF, <CustomersPage />);
    await screen.findByRole("link", { name: "Luna Jewels" });
    await userEvent.click(within(row("Luna Jewels")).getAllByText("Trade")[0]!);
    expect(navigation.push).toHaveBeenCalledWith(`/customers/${LUNA_ID}`);
  });

  it("shows disabled customers under Disabled and All", async () => {
    renderAs(STAFF, <CustomersPage />);
    await screen.findByRole("link", { name: "Luna Jewels" });
    await userEvent.selectOptions(screen.getByLabelText("Status"), "disabled");
    expect(await screen.findByRole("link", { name: "Old Works" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link", { name: "Luna Jewels" })).not.toBeInTheDocument());
    expect(within(row("Old Works")).getByText("Disabled")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Status"), "all");
    expect(await screen.findByRole("link", { name: "Luna Jewels" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Old Works" })).toBeInTheDocument();
  });

  it("searches by name, then clears every filter", async () => {
    renderAs(STAFF, <CustomersPage />);
    await screen.findByRole("link", { name: "Luna Jewels" });
    const search = screen.getByRole("searchbox", { name: "Search customers" });
    expect(search).toHaveAttribute("maxLength", "100");

    await userEvent.type(search, "mira");
    await waitFor(() => expect(screen.queryByRole("link", { name: "Luna Jewels" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Mira Studio" })).toBeInTheDocument();
    expect(lists.at(-1)!.searchParams.get("q")).toBe("mira");

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(await screen.findByText("No customers match.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("link", { name: "Luna Jewels" })).toBeInTheDocument();
    expect(search).toHaveValue("");
  });

  it("filters by group, none included, and by band", async () => {
    renderAs(STAFF, <CustomersPage />);
    await screen.findByRole("link", { name: "Luna Jewels" });
    await userEvent.selectOptions(screen.getByLabelText("Group"), "none");
    await waitFor(() => expect(screen.queryByRole("link", { name: "Luna Jewels" })).not.toBeInTheDocument());
    expect(lists.at(-1)!.searchParams.get("customer_group")).toBe("none");

    await userEvent.selectOptions(screen.getByLabelText("Group"), "");
    await userEvent.selectOptions(screen.getByLabelText("Band"), "gold");
    await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("link")).toHaveLength(1));
    expect(screen.getByRole("link", { name: "Mira Studio" })).toBeInTheDocument();
  });

  it("starts from the first page when a filter changes after Show more", async () => {
    const all = fakeState().catalog.list(new URLSearchParams());
    if (!all.ok) throw new Error("no customers");
    server.use(
      http.get(`${FAKE_API_URL}/customers`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(cursor ? { data: all.body.data.slice(5), next_cursor: null } : { data: all.body.data.slice(0, 5), next_cursor: "5" });
      }),
    );
    renderAs(STAFF, <CustomersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    await waitFor(() => expect(lists.at(-1)!.searchParams.get("cursor")).toBe("5"));

    await userEvent.selectOptions(screen.getByLabelText("Status"), "all");
    await waitFor(() => expect(lists.at(-1)!.searchParams.get("status")).toBeNull());
    expect(lists.at(-1)!.searchParams.has("cursor")).toBe(false);
  });

  it("says when there are no active customers, then no customers at all", async () => {
    server.use(http.get(`${FAKE_API_URL}/customers`, () => HttpResponse.json({ data: [], next_cursor: null })));
    renderAs(STAFF, <CustomersPage />);
    expect(await screen.findByText("No active customers.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show all customers" }));
    expect(await screen.findByText("No customers yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows disabled customers from an empty active list", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/customers`, ({ request }) => {
        if (new URL(request.url).searchParams.get("status") === "active") return HttpResponse.json({ data: [], next_cursor: null });
        return undefined;
      }),
    );
    renderAs(STAFF, <CustomersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Show all customers" }));
    expect(await screen.findByRole("link", { name: "Luna Jewels" })).toBeInTheDocument();
  });

  it("says when the list can't be loaded, with Try again", async () => {
    server.use(http.get(`${FAKE_API_URL}/customers`, () => FAILED(500)));
    renderAs(STAFF, <CustomersPage />);
    expect(await screen.findByText("Customers couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("leaves out a filter whose choices can't be read", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/customers/groups`, () => FAILED(403)),
      http.get(`${FAKE_API_URL}/customers/bands`, () => FAILED(403)),
    );
    renderAs(SALES_LEAD, <CustomersPage />);
    await screen.findByRole("link", { name: "Luna Jewels" });
    expect(screen.queryByLabelText("Group")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Band")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });

  it("is not found without customer.read", async () => {
    renderAs(CLERK, <CustomersPage />);
    await waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });

  it("puts the filters in a sheet on a phone", async () => {
    setScreenWidth(375);
    renderAs(STAFF, <CustomersPage />);
    await screen.findByRole("link", { name: "Luna Jewels" });
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.selectOptions(screen.getByLabelText("Status"), "disabled");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("link", { name: "Old Works" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters · 1" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters · 1" })).toHaveFocus());
  });

  it("offers New customer only with customer.write", async () => {
    const { unmount } = renderAs(STAFF, <CustomersPage />);
    expect(await screen.findByRole("link", { name: "New customer" })).toHaveAttribute("href", "/customers/new");
    unmount();
    renderAs(SALES_LEAD, <CustomersPage />);
    await screen.findByRole("link", { name: "Luna Jewels" });
    expect(screen.queryByRole("link", { name: "New customer" })).not.toBeInTheDocument();
  });

  it("gives focus back to Filters when the sheet is closed with Escape", async () => {
    setScreenWidth(375);
    renderAs(STAFF, <CustomersPage />);
    await screen.findByRole("link", { name: "Luna Jewels" });
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await screen.findByLabelText("Status");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters" })).toHaveFocus());
  });
});
