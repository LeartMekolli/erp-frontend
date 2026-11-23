import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardRange } from "@/lib/api/schema-types";

import { PRODUCTION_LEAD, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { ordersByWeek, SalesTiles } from "./sales-tiles";

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

function rangeFor(user: FakeUser, from = addDays(today(), -29), to = today()): DashboardRange {
  const answer = fakeState().reports.range(new URLSearchParams({ from, to }), user.permissions);
  if (!answer.ok) throw new Error("the fake refused the range");
  return answer.body;
}

const renderTiles = (user: FakeUser) => renderAs(user, <SalesTiles range={rangeFor(user)} today={today()} chartWidth={600} />);

describe("ordersByWeek", () => {
  it("adds a daily series up into ISO weeks, the first clipped to the range", () => {
    // 2026-11-04 is a Wednesday: its week starts on Monday 2 Nov, before the range.
    const range = rangeFor(STAFF, "2026-11-04", "2026-11-17");
    const weeks = ordersByWeek(range);
    expect(weeks.map((week) => week.start)).toEqual(["2026-11-04", "2026-11-09", "2026-11-16"]);
    const total = range.series.reduce((sum, point) => sum + point.orders_placed, 0);
    expect(weeks.reduce((sum, week) => sum + week.orders, 0)).toBe(total);
  });

  it("keeps erp-api's own weeks", () => {
    const range = rangeFor(STAFF, addDays(today(), -89), today());
    expect(range.range.bucket).toBe("week");
    expect(ordersByWeek(range)).toHaveLength(range.series.length);
  });
});

describe("SalesTiles", () => {
  it("splits revenue by product and by customer group, with No group", async () => {
    renderTiles(STAFF);
    const tile = await screen.findByRole("region", { name: "Where revenue comes from" });
    expect(within(tile).getByText("Ring band")).toBeInTheDocument();
    expect(within(tile).getByText("No group")).toBeInTheDocument();
    expect(within(tile).getByText("Retail")).toBeInTheDocument();
  });

  it("shows top customers by name only, and no revenue split, without payment.read", async () => {
    renderTiles(PRODUCTION_LEAD);
    const tile = await screen.findByRole("region", { name: "Top customers" });
    const names = within(tile).getByRole("list", { name: "Top customers" });
    expect(within(names).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Luna Jewels", "Mira Studio"]);
    expect(within(tile).queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Where revenue comes from" })).not.toBeInTheDocument();
  });

  it("names who is ordering less", async () => {
    renderTiles(STAFF);
    const tile = await screen.findByRole("region", { name: "Top customers" });
    expect(within(tile).getByText(/^Ordering less: Mira Studio, last order \d{1,2} [A-Z][a-z]{2}$/)).toBeInTheDocument();
  });

  it("shows orders per week with the current week, and the year of orders by day", async () => {
    renderTiles(STAFF);
    expect(await screen.findByRole("region", { name: "Orders per week" })).toBeInTheDocument();
    const year = today().slice(0, 4);
    expect(await screen.findByRole("region", { name: `Orders by day, ${year}` })).toBeInTheDocument();
  });
});
