import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NORTHCAST_ADMIN, NORTHCAST_ID } from "../../../../test/fake-erp-api/seed";
import { renderAs, WithMe } from "../../../../test/render";

import { PayoutsTile } from "./money-tiles";

vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/dashboard`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

function renderMoney() {
  return renderAs(
    NORTHCAST_ADMIN,
    <WithMe>
      <PayoutsTile />
    </WithMe>,
  );
}

describe("PayoutsTile", () => {
  it("lists the three newest payouts, saying so when one isn't paid", async () => {
    renderMoney();
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
