import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardRange } from "@/lib/api/schema-types";
import { dashboardKeys } from "@/lib/dashboard/queries";

import { SALES_LEAD, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { ProductionTiles } from "./production-tiles";

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

/** What the fake erp-api answers `user` for the last 30 days. */
function rangeFor(user: FakeUser): DashboardRange {
  const answer = fakeState().reports.range(new URLSearchParams({ from: addDays(today(), -29), to: today() }), user.permissions);
  if (!answer.ok) throw new Error("the fake refused the range");
  return answer.body;
}

const renderTiles = (user: FakeUser) => renderAs(user, <ProductionTiles range={rangeFor(user)} chartWidth={480} />);

describe("ProductionTiles", () => {
  it("shows Casting slower than the range before, in red with ▲", async () => {
    renderTiles(STAFF);
    const tile = await screen.findByRole("region", { name: "Where time goes" });
    expect(within(tile).getByText("22h ▲").closest("[data-row]")).toHaveTextContent(/^Casting/);
    expect(within(tile).getByRole("row", { name: "Casting 17h 22h" })).toBeInTheDocument();
  });

  it("shows the pieces at each step now for staff with workflow.read", async () => {
    renderTiles(STAFF);
    const tile = await screen.findByRole("region", { name: "Pieces in production now" });
    expect(within(tile).getByRole("row", { name: /^Casting \d/ })).toBeInTheDocument();
    expect(within(tile).getByText(/Casting 3/)).toBeInTheDocument();
  });

  it("leaves out the pieces tile when erp-api leaves out production", async () => {
    const { client } = renderTiles(SALES_LEAD);
    // The pieces come with the live dashboard: wait for its answer.
    await waitFor(() => expect(client.getQueryState(dashboardKeys.dashboard())?.status).toBe("success"));
    expect(screen.queryByRole("heading", { name: "Pieces in production now" })).not.toBeInTheDocument();
  });

  it("shows on time against the target, and defects with the rate, claims and remakes", async () => {
    renderTiles(STAFF);
    const onTime = await screen.findByRole("region", { name: "On time against target" });
    expect(within(onTime).getByRole("figure", { name: /against a target of 95%$/ })).toBeInTheDocument();
    expect(within(onTime).getByText("Target 95%")).toBeInTheDocument();
    const defects = screen.getByRole("region", { name: "Defects by kind" });
    expect(within(defects).getByText(/^Defect rate/)).toBeInTheDocument();
    expect(within(defects).getByText(/^\d+ claims? · \d+ remakes?$/)).toBeInTheDocument();
  });
});
