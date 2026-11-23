import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardRange } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";

import { NO_ACCESS, PRODUCTION_LEAD, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { DashboardPage } from "./dashboard-page";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), notFound: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
  notFound: navigation.notFound,
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.notFound.mockReset();
  navigation.search = "";
});

// The fake workspace's time zone is UTC, so its today is the UTC date.
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

/** What the fake erp-api answers `user` for the days ending today. */
function expected(user: FakeUser, days: number): DashboardRange {
  const answer = fakeState().reports.range(new URLSearchParams({ from: addDays(today(), -(days - 1)), to: today() }), user.permissions);
  if (!answer.ok) throw new Error("the fake refused the range");
  return answer.body;
}

const hero = (name: RegExp) => screen.findByRole("region", { name });
const revenueOf = (range: DashboardRange) => formatMoney(range.current.orders.revenue!, range.current.currency);

describe("DashboardPage", () => {
  it("is not found without report.read", () => {
    renderAs(NO_ACCESS, <DashboardPage />);
    return waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });

  it("shows the title, the greeting and the range picker", async () => {
    renderAs(STAFF, <DashboardPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText(/^Good (morning|afternoon|evening), /)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Date range" })).toBeInTheDocument();
  });

  it("leads with revenue, then Orders placed, Average order, On time and Defect rate", async () => {
    renderAs(STAFF, <DashboardPage />);
    const tile = await hero(/^Revenue · last 30 days$/);
    expect(within(tile).getByText(revenueOf(expected(STAFF, 30)))).toBeInTheDocument();
    expect(within(tile).getByRole("button", { name: "Revenue" })).toHaveAttribute("aria-pressed", "true");
    const KPIS = ["Orders placed", "Average order", "On time", "Defect rate"];
    const kpis = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent).filter((name) => KPIS.includes(name ?? ""));
    expect(kpis).toEqual(KPIS);
    expect(await screen.findByRole("region", { name: "Needs attention" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "AI briefing" })).toBeInTheDocument();
  });

  it("shows no money and drops the On time tile for a reader without payment.read", async () => {
    renderAs(PRODUCTION_LEAD, <DashboardPage />);
    const tile = await hero(/^On time · last 30 days$/);
    expect(tile).toBeInTheDocument();
    expect(screen.queryByText(/Revenue|Average order/)).not.toBeInTheDocument();
    expect(screen.queryByText(/€0/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "On time" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Orders placed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Defect rate" })).toBeInTheDocument();
  });

  it("says when the range has no orders, and still draws the hero", async () => {
    navigation.search = `from=${addDays(today(), 10)}&to=${addDays(today(), 39)}`;
    renderAs(STAFF, <DashboardPage />);
    const tile = await hero(/^Revenue · /);
    expect(within(tile).getByText("No orders in these 30 days")).toBeInTheDocument();
  });

  it("keeps the last range's figures, dimmed and busy, while a new range loads", async () => {
    const { container, rerender } = renderAs(STAFF, <DashboardPage />);
    const before = revenueOf(expected(STAFF, 30));
    await screen.findByText(before);

    navigation.search = "range=7d";
    rerender(<DashboardPage />);
    const bento = container.querySelector("[aria-busy]");
    expect(bento).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(before)).toBeInTheDocument();

    const after = revenueOf(expected(STAFF, 7));
    expect(await screen.findByText(after)).toBeInTheDocument();
    expect(container.querySelector("[aria-busy]")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("region", { name: /^Revenue · last 7 days$/ })).toBeInTheDocument();
  });
});
