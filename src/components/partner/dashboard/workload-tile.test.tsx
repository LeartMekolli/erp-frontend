import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NORTHCAST_ID, NORTHCAST_MEMBER } from "../../../../test/fake-erp-api/seed";
import { renderAs, WithMe } from "../../../../test/render";

import { WorkloadTile } from "./workload-tile";

vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/dashboard`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

function renderTile(range: { from: string; to: string }, words: string, today: string) {
  return renderAs(
    NORTHCAST_MEMBER,
    <WithMe>
      <WorkloadTile partnerId={NORTHCAST_ID} range={range} words={words} today={today} />
    </WithMe>,
  );
}

describe("WorkloadTile", () => {
  it("dates the figure when the range ended before yesterday, so it doesn't read as now", async () => {
    renderTile({ from: "2026-10-01", to: "2026-10-31" }, "1–31 Oct", "2026-11-24");
    const tile = await screen.findByRole("region", { name: "Waiting for Casting · 1–31 Oct" });
    // Casting was 45 a day until the fake's raise on 5 Nov.
    expect(within(tile).getByText(/^pieces waiting on 31 Oct · capacity 45 a day$/)).toBeInTheDocument();
  });

  it("leaves the date out when the range runs to today", async () => {
    renderTile({ from: "2026-10-26", to: "2026-11-24" }, "last 30 days", "2026-11-24");
    const tile = await screen.findByRole("region", { name: "Waiting for Casting · last 30 days" });
    expect(within(tile).getByText(/^pieces waiting · capacity 50 a day$/)).toBeInTheDocument();
  });
});
