import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PRODUCTION_LEAD, STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { AttentionTile } from "./attention-tile";

describe("AttentionTile", () => {
  it("lists what needs attention with its total, each row opening its list", async () => {
    renderAs(STAFF, <AttentionTile />);
    const atRisk = await screen.findByRole("link", { name: /^Orders at risk \d+$/ });
    expect(atRisk).toHaveAttribute("href", "/orders");
    expect(screen.getByRole("link", { name: /^Awaiting payment 2$/ })).toBeInTheDocument();
  });

  it("follows each kind's permission: no payment kinds without payment.read", async () => {
    renderAs(PRODUCTION_LEAD, <AttentionTile />);
    const tile = await screen.findByRole("region", { name: "Needs attention" });
    await within(tile).findByRole("link", { name: /^Orders at risk/ });
    expect(within(tile).queryByRole("link", { name: /Awaiting payment|Invoices overdue/ })).not.toBeInTheDocument();
  });
});
