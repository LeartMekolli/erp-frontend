import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PartnerSummary } from "@/lib/api/schema-types";

import { NORTHCAST_ADMIN, NORTHCAST_ID } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { renderAs, WithMe } from "../../../../test/render";

import { EarnedTile, PayoutsTile } from "./money-tiles";

vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/dashboard`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const RANGE = new URLSearchParams({ from: "2026-10-26", to: "2026-11-24" });

function summaryAs(role: "admin" | "member"): PartnerSummary {
  const answer = fakeState().partnerDashboard.summary(NORTHCAST_ID, RANGE, role);
  if (!answer.ok) throw new Error("the fake refused the range");
  return answer.body;
}

function renderMoney(summary: PartnerSummary) {
  return renderAs(
    NORTHCAST_ADMIN,
    <WithMe>
      <EarnedTile summary={summary} words="last 30 days" />
      <PayoutsTile />
    </WithMe>,
  );
}

describe("EarnedTile", () => {
  it("shows what was earned in the range against the range before, then what's owed", async () => {
    renderMoney(summaryAs("admin"));
    const tile = await screen.findByRole("region", { name: "Earned · last 30 days" });
    expect(within(tile).getByText("€11,640.00")).toBeInTheDocument();
    expect(tile).toHaveTextContent("▲ 19%");
    expect(tile).toHaveTextContent("vs previous 30 days (€9,800.00)");
    expect(await within(tile).findByText("€1,240.00")).toBeInTheDocument();
    expect(within(tile).getByText("Owed now").nextSibling).toHaveTextContent("€1,240.00");
    expect(within(tile).getByText("Not yet owed").nextSibling).toHaveTextContent("€380.00");
    expect(within(tile).getByRole("link", { name: /Earnings/ })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/earnings`);
  });

  it("isn't there when erp-api sent no money", () => {
    const { container } = render(<EarnedTile summary={summaryAs("member")} words="last 30 days" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PayoutsTile", () => {
  it("lists the three newest payouts, saying so when one isn't paid", async () => {
    renderMoney(summaryAs("admin"));
    const tile = await screen.findByRole("region", { name: "Latest payouts" });
    const rows = await within(tile).findAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("€420.00");
    expect(rows[0]).toHaveTextContent("On its way");
    expect(rows[1]).toHaveTextContent("€860.00");
    expect(rows[1]).not.toHaveTextContent("Paid");
    expect(rows[2]).toHaveTextContent("€120.00");
    expect(rows[2]).toHaveTextContent("Failed. Owed to you again");
  });
});
