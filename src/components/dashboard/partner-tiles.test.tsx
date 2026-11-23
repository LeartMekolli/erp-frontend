import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardRange } from "@/lib/api/schema-types";

import { SALES_LEAD, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";

import { PartnerTiles } from "./partner-tiles";

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

function rangeFor(user: FakeUser): DashboardRange {
  const answer = fakeState().reports.range(new URLSearchParams({ from: addDays(today(), -29), to: today() }), user.permissions);
  if (!answer.ok) throw new Error("the fake refused the range");
  return answer.body;
}

describe("PartnerTiles", () => {
  it("shows each workshop's load and on-time rate", () => {
    render(<PartnerTiles range={rangeFor(STAFF)} chartWidth={400} />);
    const tile = screen.getByRole("region", { name: "Partner load" });
    const load = within(tile).getByRole("list", { name: "Load against capacity" });
    expect(within(load).getByText("Northcast Foundry")).toBeInTheDocument();
    expect(within(load).getByText("72%")).toBeInTheDocument();
    expect(within(tile).getByRole("list", { name: "Partners on time" })).toBeInTheDocument();
  });

  it("says Near capacity at 90% or more", () => {
    const range = rangeFor(STAFF);
    const busy: DashboardRange = {
      ...range,
      current: { ...range.current, partners: { ...range.current.partners!, load: [{ id: range.current.partners!.load[0]!.id, name: "Northcast Foundry", percent: 92 }] } },
    };
    render(<PartnerTiles range={busy} chartWidth={400} />);
    expect(screen.getByText("▲ Near capacity")).toBeInTheDocument();
  });

  it("puts partner cost against revenue, with the margin", () => {
    render(<PartnerTiles range={rangeFor(STAFF)} chartWidth={400} />);
    const tile = screen.getByRole("region", { name: "Partner cost against revenue" });
    expect(within(tile).getByText(/^Margin/)).toBeInTheDocument();
    expect(within(tile).getByText(/^· \d+% of revenue$/)).toBeInTheDocument();
    expect(within(tile).getByRole("columnheader", { name: "Partner cost" })).toBeInTheDocument();
  });

  it("isn't there without partner.read", () => {
    render(<PartnerTiles range={rangeFor(SALES_LEAD)} chartWidth={400} />);
    expect(screen.queryByRole("heading", { name: "Partner load" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Partner cost against revenue" })).not.toBeInTheDocument();
  });
});
