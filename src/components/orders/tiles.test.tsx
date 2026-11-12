import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { OrderCounts } from "@/lib/api/schema-types";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { Tiles } from "./tiles";

// The seeded orders: 10 open, every one needing staff for at least one reason.
function renderTiles() {
  const onPickReason = vi.fn();
  renderAs(STAFF, <Tiles onPickReason={onPickReason} />);
  return { onPickReason };
}

describe("Tiles", () => {
  it("shows the total and the open orders", async () => {
    renderTiles();
    const hero = (await screen.findByRole("heading", { name: "Need you today" })).closest("section")!;
    expect(await within(hero).findByText("10")).toBeInTheDocument();
    expect(within(hero).getByText("of 10 open orders")).toBeInTheDocument();
  });

  it("the legend reads each reason as text", async () => {
    renderTiles();
    for (const name of ["2 late", "3 to ship", "3 to collect", "3 due soon"])
      expect(await screen.findByRole("button", { name })).toBeInTheDocument();
  });

  it("picking a reason calls back with it", async () => {
    const { onPickReason } = renderTiles();
    await userEvent.click(await screen.findByRole("button", { name: "3 to ship" }));
    expect(onPickReason).toHaveBeenLastCalledWith("to_ship");
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(onPickReason).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: /^Late/ }));
    expect(onPickReason).toHaveBeenLastCalledWith("late");
    await userEvent.click(screen.getByRole("button", { name: /^Awaiting payment/ }));
    expect(onPickReason).toHaveBeenLastCalledWith("to_collect");
    await userEvent.click(screen.getByRole("button", { name: /^Ready to ship/ }));
    expect(onPickReason).toHaveBeenLastCalledWith("to_ship");
  });

  it("a tile at 0 is not a button", async () => {
    const counts: OrderCounts = {
      all: 5,
      states: { awaiting_payment: 1, in_production: 2, ready: 2, shipped: 0, delivered: 0, cancelled: 0 },
      needs_you: { total: 3, late: 0, to_ship: 2, to_collect: 1, due_soon: 0 },
      to_collect_amounts: [],
    };
    server.use(http.get(`${FAKE_API_URL}/orders/counts`, () => HttpResponse.json(counts)));
    renderTiles();
    await screen.findByRole("button", { name: /^Ready to ship/ });
    expect(screen.queryByRole("button", { name: /^Late/ })).not.toBeInTheDocument();
    const late = screen.getByRole("heading", { name: "Late" }).closest("section")!;
    expect(within(late).getByText("None")).toBeInTheDocument();
  });

  it("Late names the most overdue order", async () => {
    renderTiles();
    expect(await screen.findByText("Fieldnote Studio · 2 days late")).toBeInTheDocument();
  });

  it("Ready to ship says when the first was due in the past", async () => {
    renderTiles();
    expect(await screen.findByText("First was due 1 day ago")).toBeInTheDocument();
  });

  it("Awaiting payment counts orders and those overdue in its foot", async () => {
    renderTiles();
    const tile = await screen.findByRole("button", { name: /^Awaiting payment/ });
    expect(await within(tile).findByText("3 orders, 1 overdue")).toBeInTheDocument();
  });

  /** The counts answer, with `amounts` still to collect on 3 orders. */
  function collecting(amounts: OrderCounts["to_collect_amounts"]) {
    const counts: OrderCounts = {
      all: 5,
      states: { awaiting_payment: 3, in_production: 1, ready: 1, shipped: 0, delivered: 0, cancelled: 0 },
      needs_you: { total: 4, late: 0, to_ship: 1, to_collect: 3, due_soon: 0 },
      to_collect_amounts: amounts,
    };
    server.use(http.get(`${FAKE_API_URL}/orders/counts`, () => HttpResponse.json(counts)));
  }

  it("shows the amount to collect", async () => {
    collecting([{ currency: "EUR", amount: "2916.40" }]);
    renderTiles();
    const tile = await screen.findByRole("button", { name: /^Awaiting payment/ });
    expect(await within(tile).findByText("€2,916.40")).toBeInTheDocument();
    expect(within(tile).queryByText("orders", { exact: true })).not.toBeInTheDocument();
    expect(await within(tile).findByText(/^3 orders/)).toBeInTheDocument();
  });

  it("puts other currencies in the foot", async () => {
    collecting([
      { currency: "EUR", amount: "2916.40" },
      { currency: "USD", amount: "120.00" },
    ]);
    renderTiles();
    const tile = await screen.findByRole("button", { name: /^Awaiting payment/ });
    expect(await within(tile).findByText("€2,916.40")).toBeInTheDocument();
    // AMI's money formatter names the dollar "US$" (`src/lib/format/money.ts`).
    expect(await within(tile).findByText(/^\+ US\$120\.00 · 3 orders/)).toBeInTheDocument();
  });

  it("leads with the workspace's currency", async () => {
    collecting([
      { currency: "CHF", amount: "50.00" },
      { currency: "EUR", amount: "2916.40" },
    ]);
    renderTiles();
    const tile = await screen.findByRole("button", { name: /^Awaiting payment/ });
    expect(await within(tile).findByText("€2,916.40")).toBeInTheDocument();
    expect(await within(tile).findByText(/^\+ CHF\s50\.00 · 3 orders/)).toBeInTheDocument();
  });

  it("falls back to the count with no amounts", async () => {
    collecting([]);
    renderTiles();
    const tile = await screen.findByRole("button", { name: /^Awaiting payment/ });
    expect(tile).toHaveTextContent(/Awaiting payment\s*3\s*orders/);
  });

  it("offers Try again when the numbers can't load", async () => {
    server.use(http.get(`${FAKE_API_URL}/orders/counts`, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })));
    renderTiles();
    expect(await screen.findByText("Couldn't load the numbers.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
