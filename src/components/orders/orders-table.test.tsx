import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addDays, promisedText, workspaceToday } from "@/lib/orders/labels";
import { DEFAULT_VIEW, type OrdersView } from "@/lib/orders/view";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { OrdersTable } from "./orders-table";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/orders" }));

beforeEach(() => push.mockReset());

const orderId = (number: number) => `22222222-0000-4000-8000-${String(number).padStart(12, "0")}`;
const today = () => workspaceToday("UTC");

/** The table with its selection held in state, as the page holds it. */
function renderTable(view: Partial<OrdersView> = {}) {
  const onChange = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    return (
      <>
        <input aria-label="Somewhere else" />
        <OrdersTable view={{ ...DEFAULT_VIEW, ...view }} onChange={onChange} selected={selected} onSelect={setSelected} />
      </>
    );
  }
  const rendered = renderAs(STAFF, <Harness />);
  return { ...rendered, onChange };
}

const row = (number: number) => screen.findByRole("row", { name: new RegExp(`#${number}\\b`) });

describe("OrdersTable", () => {
  it("is a table captioned Orders", async () => {
    renderTable();
    expect(await screen.findByRole("table", { name: "Orders" })).toBeInTheDocument();
  });

  it("renders a row's order, customer, lines, status, payment, promised and total", async () => {
    renderTable({ tab: "all" });
    const r = await row(1041);
    expect(r).toHaveTextContent("Fieldnote Studio");
    expect(r).toHaveTextContent("40 × Bracket");
    expect(r).toHaveTextContent("In production · Late");
    expect(r).toHaveTextContent("Paid");
    expect(r).toHaveTextContent(promisedText(addDays(today(), -2), today(), true));
    expect(r).toHaveTextContent("€1,284.00");
    expect(await row(1049)).toHaveTextContent("3 lines");
  });

  it("shows the first reason after the status", async () => {
    renderTable({ tab: "all" });
    expect(await row(1042)).toHaveTextContent("Ready to ship · Late");
    expect(await row(1048)).toHaveTextContent("In production · Due soon");
    expect(await row(1053)).toHaveTextContent("Delivered");
    expect(await row(1047)).toHaveTextContent("Overdue");
  });

  it("formats 99,999.99 exactly", async () => {
    renderTable({ tab: "all" });
    expect(await row(1050)).toHaveTextContent("€99,999.99");
  });

  it("opens the order on click and on Enter", async () => {
    renderTable();
    const r = await row(1041);
    await userEvent.click(within(r).getAllByText("Fieldnote Studio")[0]!);
    expect(push).toHaveBeenLastCalledWith(`/orders/${orderId(1041)}`);
    act(() => r.focus());
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("does not open the order from its checkbox", async () => {
    renderTable();
    const r = await row(1041);
    await userEvent.click(within(r).getByRole("checkbox", { name: "Select order #1041" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("J and K move, X toggles", async () => {
    renderTable();
    const first = await row(1041);
    act(() => first.focus());
    await userEvent.keyboard("j");
    expect(await row(1042)).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}k");
    expect(await row(1042)).toHaveFocus();
    await userEvent.keyboard("k");
    expect(first).toHaveFocus();
    await userEvent.keyboard("x");
    expect(within(first).getByRole("checkbox", { name: "Select order #1041" })).toBeChecked();
  });

  it("keys are ignored while typing elsewhere", async () => {
    renderTable();
    const first = await row(1041);
    act(() => first.focus());
    const input = screen.getByRole("textbox", { name: "Somewhere else" });
    await userEvent.click(input);
    await userEvent.keyboard("jx");
    expect(input).toHaveValue("jx");
    expect(within(first).getByRole("checkbox", { name: "Select order #1041" })).not.toBeChecked();
  });

  it("selects every loaded row from the header", async () => {
    renderTable();
    await row(1041);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all loaded orders" }));
    expect(within(await row(1047)).getByRole("checkbox")).toBeChecked();
  });

  it("keeps the focused row and selection across a refetch", async () => {
    const { client } = renderTable();
    const second = await row(1042);
    act(() => second.focus());
    await userEvent.keyboard("x");
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(within(screen.getByRole("row", { name: /#1042\b/ })).getByRole("checkbox")).toBeChecked());
    expect(screen.getByRole("row", { name: /#1042\b/ })).toHaveFocus();
  });

  it("says when nothing needs you, with a link to all orders", async () => {
    server.use(http.get(`${FAKE_API_URL}/orders`, () => HttpResponse.json({ data: [], next_cursor: null })));
    renderTable();
    expect(await screen.findByText("Nothing needs you today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all orders" })).toHaveAttribute("href", "/orders?tab=all");
  });

  it("says when no orders match, and clears the filters", async () => {
    const { onChange } = renderTable({ tab: "all", q: "zzz" });
    expect(await screen.findByText("No orders match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onChange).toHaveBeenCalledWith({ reason: null, payment: [], from: null, to: null, q: null });
  });

  it("says when there are no orders yet", async () => {
    server.use(http.get(`${FAKE_API_URL}/orders`, () => HttpResponse.json({ data: [], next_cursor: null })));
    renderTable({ tab: "all" });
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New order" })).toHaveAttribute("href", "/orders/new");
  });

  it("shows the problem and Try again when the list fails", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/orders`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Service Unavailable", status: 503, detail: "The database is busy." },
          { status: 503, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderTable();
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
