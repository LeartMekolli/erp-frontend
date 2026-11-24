import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RING_OFFER_ID } from "../../../../test/fake-erp-api/partner-jobs";
import { LAYERLINE_ID, NORTHCAST_ADMIN, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER, PARTNER_TWO_SHOPS, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs, WithMe } from "../../../../test/render";

import { PartnerDashboardPage } from "./dashboard-page";

const navigation = vi.hoisted(() => ({ partnerId: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${navigation.partnerId}/dashboard`,
  useParams: () => ({ partnerId: navigation.partnerId }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

/** Every partner route the page called, by path. */
let paths: string[] = [];
beforeEach(() => {
  navigation.partnerId = NORTHCAST_ID;
  paths = [];
  server.events.on("request:start", ({ request }) => {
    paths.push(new URL(request.url).pathname);
  });
});
afterEach(() => server.events.removeAllListeners());

// A new element each time: re-rendering the same element object lets React skip the page entirely.
const page = () => (
  <WithMe>
    <PartnerDashboardPage />
  </WithMe>
);

function renderPage(user: FakeUser) {
  return renderAs(user, page());
}

/** The tiles' titles in the page's order, which is a phone's reading order. */
const titles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

const MONEY = /Earned|Latest payouts|Owed now|Not yet owed|Payout account|€0/;

describe("the dashboard by role", () => {
  it("shows a member no money at all, and never asks erp-api for it", async () => {
    renderPage(NORTHCAST_MEMBER);
    await screen.findByRole("img", { name: "Score 4.4 out of 5" });
    await screen.findByRole("region", { name: /^Waiting for Casting/ });
    const setup = await screen.findByRole("region", { name: "Setup still to finish" });
    await within(setup).findByText("3 of 3");

    expect(document.body).not.toHaveTextContent(MONEY);
    const money = paths.filter((path) => /\/(owed|payouts|payout-account)$/.test(path));
    expect(money).toEqual([]);
    expect(titles()).toEqual([
      "Waiting for Casting · last 30 days",
      "Offers waiting for you",
      "In progress",
      "Late",
      "Due in 2 working days",
      "Finished · last 30 days",
      "Your score",
      "Pieces at your steps now",
      "Ratings",
      "Setup still to finish",
      "Recent activity",
    ]);
  });

  it("gives an admin the money tiles too, in their places", async () => {
    renderPage(NORTHCAST_ADMIN);
    const earned = await screen.findByRole("region", { name: "Earned · last 30 days" });
    expect(await within(earned).findByText("Owed now")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Latest payouts" })).toBeInTheDocument();
    const setup = await screen.findByRole("region", { name: "Setup still to finish" });
    expect(await within(setup).findByText("3 of 4")).toBeInTheDocument();
    expect(within(setup).getByText("Payout account").closest("li")).toHaveTextContent("To do");
    await screen.findByRole("region", { name: /^Waiting for Casting/ });
    expect(titles()).toEqual([
      "Waiting for Casting · last 30 days",
      "Offers waiting for you",
      "Earned · last 30 days",
      "In progress",
      "Late",
      "Due in 2 working days",
      "Finished · last 30 days",
      "Your score",
      "Pieces at your steps now",
      "Ratings",
      "Latest payouts",
      "Setup still to finish",
      "Recent activity",
    ]);
  });

  it("lists the person's newest notifications, each opening what it's about", async () => {
    renderPage(PARTNER);
    const activity = await screen.findByRole("region", { name: "Recent activity" });
    const ring = await within(activity).findByRole("link", { name: /New job offered: Ring/ });
    expect(ring).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs/${RING_OFFER_ID}`);
    expect(within(activity).getByRole("link", { name: /You have been paid/ })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/earnings`);
  });

  it("says nothing has happened yet with an empty feed", async () => {
    renderPage(NORTHCAST_ADMIN);
    const activity = await screen.findByRole("region", { name: "Recent activity" });
    expect(await within(activity).findByText("Nothing yet.")).toBeInTheDocument();
  });

  it("tells a suspended workshop it can only read", async () => {
    fakeState().suspendPartner(NORTHCAST_ID);
    renderPage(NORTHCAST_MEMBER);
    const setup = await screen.findByRole("region", { name: "Setup still to finish" });
    expect(await within(setup).findByText("Suspended by staff: you can read, but not change anything.")).toBeInTheDocument();
  });

  it("shows each workshop's own numbers to someone working for two", async () => {
    const { rerender } = renderPage(PARTNER_TWO_SHOPS);
    expect(await screen.findByRole("img", { name: "Score 4.4 out of 5" })).toBeInTheDocument();

    navigation.partnerId = LAYERLINE_ID;
    rerender(page());

    expect(await screen.findByRole("img", { name: "No score yet" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Score 4.4 out of 5" })).toBeNull();
  });
});
