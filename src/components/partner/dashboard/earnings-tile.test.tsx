import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PartnerSummary } from "@/lib/api/schema-types";

import { NORTHCAST_ADMIN, NORTHCAST_ID } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { renderAs, WithMe } from "../../../../test/render";

import { EarningsTile } from "./earnings-tile";

vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/dashboard`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const LAST_30_DAYS = new URLSearchParams({ from: "2026-10-26", to: "2026-11-24" });

function summary(range = LAST_30_DAYS): PartnerSummary {
  const answer = fakeState().partnerDashboard.summary(NORTHCAST_ID, range, "admin");
  if (!answer.ok) throw new Error("the fake refused the range");
  return answer.body;
}

function renderTile(shown: PartnerSummary | undefined, { words = "last 30 days", failure }: { words?: string; failure?: { error: unknown; retry: () => void } } = {}) {
  return renderAs(
    NORTHCAST_ADMIN,
    <WithMe>
      <EarningsTile summary={shown} words={words} failure={failure} />
    </WithMe>,
  );
}

const tile = (words = "last 30 days") => screen.findByRole("region", { name: `Earned · ${words}` });

describe("EarningsTile", () => {
  it("shows what was earned against the range before, split into paid out, on its way and owed", async () => {
    renderTile(summary());
    const hero = await tile();
    expect(within(hero).getByText("€11,640.00")).toBeInTheDocument();
    expect(hero).toHaveTextContent("▲ 19%");
    expect(within(hero).getByRole("columnheader", { name: "Paid out" })).toBeInTheDocument();
    expect(within(hero).getByRole("columnheader", { name: "On its way" })).toBeInTheDocument();
    expect(within(hero).getByRole("columnheader", { name: "Owed" })).toBeInTheDocument();
    expect(within(hero).getAllByRole("row")).toHaveLength(31);
    const legend = within(hero).getByRole("list", { name: "Earned in the range" });
    expect(legend).toHaveTextContent("Paid out €6,208.00");
    expect(legend).toHaveTextContent("On its way €2,716.00");
    expect(legend).toHaveTextContent("Owed €2,716.00");
  });

  it("says what's owed now, not yet owed and the last payout", async () => {
    renderTile(summary());
    const hero = await tile();
    expect(await within(hero).findByText("Owed now")).toBeInTheDocument();
    expect(within(hero).getByText("Owed now").nextSibling).toHaveTextContent("€1,240.00");
    expect(within(hero).getByText("Not yet owed").nextSibling).toHaveTextContent("€380.00");
    expect(await within(hero).findByText("€860.00", { exact: false })).toBeInTheDocument();
    expect(within(hero).getByRole("link", { name: /Earnings/ })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/earnings`);
  });

  it("says nothing was earned instead of drawing empty columns", async () => {
    const zero = "0.00";
    const empty = summary();
    renderTile({
      ...empty,
      earned: zero,
      paid_total: zero,
      pending_total: zero,
      owed_total: zero,
      series: empty.series!.map((point) => ({ ...point, paid: zero, pending: zero, owed: zero })),
    });
    const hero = await tile();
    expect(within(hero).getByText("Nothing earned in the last 30 days.")).toBeInTheDocument();
  });

  it("shows money that's only on its way", async () => {
    const shown = summary();
    renderTile({
      ...shown,
      paid_total: "0.00",
      pending_total: shown.earned!,
      owed_total: "0.00",
      series: shown.series!.map((point) => ({ ...point, paid: "0.00", pending: (Number(point.paid) + Number(point.pending) + Number(point.owed)).toFixed(2), owed: "0.00" })),
    });
    const legend = within(await tile()).getByRole("list", { name: "Earned in the range" });
    expect(legend).toHaveTextContent("Paid out €0.00");
    expect(legend).toHaveTextContent("On its way €11,640.00");
  });

  it("labels a year's buckets by month", async () => {
    renderTile(summary(new URLSearchParams({ from: "2026-01-01", to: "2026-11-24" })), { words: "this year" });
    const hero = await tile("this year");
    expect(within(hero).getByRole("cell", { name: "Nov 2026" })).toBeInTheDocument();
    expect(within(hero).getByRole("cell", { name: "Jan 2026" })).toBeInTheDocument();
  });

  it("says when the summary couldn't load, with Try again", async () => {
    renderTile(undefined, { failure: { error: new Error("broke"), retry: () => {} } });
    const hero = await tile();
    expect(within(hero).getByText("Couldn't load what you earned.")).toBeInTheDocument();
    expect(within(hero).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
