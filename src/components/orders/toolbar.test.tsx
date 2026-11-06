import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_VIEW, type OrdersView } from "@/lib/orders/view";

import { STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { Toolbar } from "./toolbar";
import { applyChange, useOrdersView } from "./use-orders-view";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.search = "";
});

/** The toolbar with its view held in state, as the page will hold it in the URL. */
function renderToolbar(start: Partial<OrdersView> = {}) {
  const changes = vi.fn();
  function Harness() {
    const [view, setView] = useState<OrdersView>({ ...DEFAULT_VIEW, ...start });
    return (
      <Toolbar
        view={view}
        onChange={(change) => {
          changes(change);
          setView((current) => applyChange(current, change));
        }}
      />
    );
  }
  renderAs(STAFF, <Harness />);
  return { changes };
}

describe("Toolbar", () => {
  it("shows each tab with its count", async () => {
    renderToolbar();
    const tabs = await screen.findByRole("tablist");
    expect(await within(tabs).findByRole("tab", { name: "Needs you 10" })).toHaveAttribute("aria-selected", "true");
    const names = within(tabs)
      .getAllByRole("tab")
      .map((tab) => tab.textContent);
    expect(names).toEqual([
      "Needs you 10",
      "All 14",
      "Awaiting payment 2",
      "In production 5",
      "Ready 3",
      "Shipped 2",
      "Delivered 1",
      "Cancelled 1",
    ]);
  });

  it("counts follow the search", async () => {
    renderToolbar({ q: "luna" });
    expect(await screen.findByRole("tab", { name: "All 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ready 1" })).toBeInTheDocument();
  });

  it("choosing a tab changes it and clears the reason", async () => {
    const { changes } = renderToolbar({ reason: "late" });
    expect(await screen.findByRole("button", { name: "Remove filter: Late" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("tab", { name: /^All/ }));
    expect(changes).toHaveBeenLastCalledWith({ tab: "all" });
    expect(screen.queryByRole("button", { name: "Remove filter: Late" })).not.toBeInTheDocument();
  });

  it("the reason chip removes the reason", async () => {
    const { changes } = renderToolbar({ reason: "late" });
    await userEvent.click(await screen.findByRole("button", { name: "Remove filter: Late" }));
    expect(changes).toHaveBeenLastCalledWith({ reason: null });
  });

  it("filters by payment state and promised range", async () => {
    const { changes } = renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog", { name: "Filter" });
    expect(within(panel).queryByRole("checkbox", { name: /none/i })).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Overdue" }));
    expect(changes).toHaveBeenLastCalledWith({ payment: ["overdue"] });
    await userEvent.type(within(panel).getByLabelText("Promised from"), "2026-11-01");
    expect(changes).toHaveBeenLastCalledWith({ from: "2026-11-01" });
    await userEvent.type(within(panel).getByLabelText("Promised to"), "2026-11-30");
    expect(changes).toHaveBeenLastCalledWith({ to: "2026-11-30" });

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Overdue" }));
    expect(changes).toHaveBeenLastCalledWith({ payment: [] });
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Promised" }));
    expect(changes).toHaveBeenLastCalledWith({ from: null, to: null });
  });

  it("refuses a to day before the from day", async () => {
    const { changes } = renderToolbar({ from: "2026-11-10" });
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog", { name: "Filter" });
    await userEvent.type(within(panel).getByLabelText("Promised to"), "2026-11-05");
    expect(within(panel).getByText("Pick a day on or after the first.")).toBeInTheDocument();
    expect(changes).not.toHaveBeenCalledWith({ to: "2026-11-05" });
  });

  it("search waits for typing to stop, and Escape clears it", async () => {
    const { changes } = renderToolbar();
    const search = screen.getByRole("searchbox", { name: "Search orders" });
    expect(search).toHaveAttribute("placeholder", "Order number or customer");
    await userEvent.type(search, "luna");
    expect(changes).not.toHaveBeenCalled();
    await waitFor(() => expect(changes).toHaveBeenCalledWith({ q: "luna" }));
    expect(changes).toHaveBeenCalledTimes(1);
    await userEvent.type(search, "{Escape}");
    expect(search).toHaveValue("");
    expect(changes).toHaveBeenLastCalledWith({ q: null });
  });

  it("sort shows the tab's default, and changes it", async () => {
    const { changes } = renderToolbar();
    expect(screen.getByRole("button", { name: /^Sort/ })).toHaveTextContent("Promised date");
    await userEvent.click(screen.getByRole("tab", { name: /^All/ }));
    expect(screen.getByRole("button", { name: /^Sort/ })).toHaveTextContent("Newest");
    await userEvent.click(screen.getByRole("button", { name: /^Sort/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Oldest" }));
    expect(changes).toHaveBeenLastCalledWith({ sort: "placed_at" });
  });
});

describe("applyChange", () => {
  it("clears the reason when the tab changes, and keeps it otherwise", () => {
    const view: OrdersView = { ...DEFAULT_VIEW, reason: "late" };
    expect(applyChange(view, { tab: "all" }).reason).toBeNull();
    expect(applyChange(view, { q: "luna" }).reason).toBe("late");
  });

  it("keeps a reason that comes with the tab change", () => {
    const view: OrdersView = { ...DEFAULT_VIEW, tab: "all" };
    expect(applyChange(view, { tab: "needs", reason: "late" })).toEqual({ ...DEFAULT_VIEW, reason: "late" });
  });

  it("drops a sort that is the tab's default", () => {
    expect(applyChange(DEFAULT_VIEW, { sort: "promised_on" }).sort).toBeNull();
  });
});

describe("useOrdersView", () => {
  it("reads the view from the URL", () => {
    navigation.search = "tab=ready&q=luna";
    const { result } = renderHook(() => useOrdersView());
    expect(result.current[0]).toEqual({ ...DEFAULT_VIEW, tab: "ready", q: "luna" });
  });

  it("adds a history step for a tab and replaces it for anything else", () => {
    navigation.search = "reason=late";
    const { result } = renderHook(() => useOrdersView());
    act(() => result.current[1]({ tab: "all" }));
    expect(navigation.push).toHaveBeenCalledWith("/orders?tab=all", { scroll: false });
    act(() => result.current[1]({ q: "luna" }));
    expect(navigation.replace).toHaveBeenCalledWith("/orders?reason=late&q=luna", { scroll: false });
  });

  it("goes back to the bare path for the default view", () => {
    navigation.search = "q=luna";
    const { result } = renderHook(() => useOrdersView());
    act(() => result.current[1]({ q: null }));
    expect(navigation.replace).toHaveBeenCalledWith("/orders", { scroll: false });
  });
});
