import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { uuid } from "../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, NORTHCAST_ID, PAYER, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";
import { until } from "../../../test/wait";

import { PartnerPage } from "./partner-page";

const navigation = vi.hoisted(() => ({ id: "", search: "", replace: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
  notFound: navigation.notFound,
}));

beforeEach(() => {
  navigation.id = NORTHCAST_ID;
  navigation.search = "";
  navigation.replace.mockReset();
  navigation.notFound.mockReset();
});

describe("PartnerPage", () => {
  it("heads the page with the partner", async () => {
    renderAs(STAFF, <PartnerPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Northcast Foundry" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Partners" })).toHaveAttribute("href", "/partners");
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("says when a partner isn't there", async () => {
    navigation.id = "00000000-0000-4000-8000-000000000000";
    renderAs(STAFF, <PartnerPage />);
    expect(await screen.findByRole("heading", { name: "This partner doesn't exist or was removed." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Partners" })).toHaveAttribute("href", "/partners");
  });

  it("puts the Payouts tab in the address", async () => {
    renderAs(STAFF, <PartnerPage />);
    await screen.findByRole("heading", { level: 1, name: "Northcast Foundry" });
    expect(screen.getByRole("tablist", { name: "This partner's pay" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");

    await userEvent.click(screen.getByRole("tab", { name: "Payouts" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(`/partners/${NORTHCAST_ID}?tab=payouts`, { scroll: false });
  });

  it("shows Payouts only with payment.read", async () => {
    navigation.search = "tab=payouts";
    renderAs(PAYER, <PartnerPage />);
    await screen.findByRole("heading", { level: 1, name: "Northcast Foundry" });
    expect(screen.queryByRole("tab", { name: "Payouts" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");
  });

  describe("jobs and payouts", () => {
    /** Order 1042's address, as the fake's orders seed it. */
    const ORDER_1042 = `/orders/${uuid("22222222", 1042)}`;

    const jobsPanel = async () => within(await screen.findByRole("tabpanel", { name: "Jobs" }));
    /** The Jobs row a job's product words are in. */
    const rowOf = (words: string) => within(within(screen.getByRole("tabpanel", { name: "Jobs" })).getByText(words).closest("li")!);

    it("shows each job's order and pay", async () => {
      renderAs(STAFF, <PartnerPage />);
      const jobs = await jobsPanel();
      await jobs.findByText("Bangle · 12 pieces");

      const bangle = rowOf("Bangle · 12 pieces");
      expect(bangle.getByRole("link", { name: "Order #1042 · line 2" })).toHaveAttribute("href", ORDER_1042);
      expect(bangle.getByText("Owed")).toBeInTheDocument();
      expect(bangle.getByText("Customer paid")).toBeInTheDocument();

      const earCuff = rowOf("Ear cuff · 20 pieces");
      expect(earCuff.getByText("Set by staff: Agreed rush surcharge")).toBeInTheDocument();
      expect(earCuff.getByText("Customer not paid yet")).toBeInTheDocument();

      const filler = rowOf("Bracket batch 17 · 4 pieces");
      expect(filler.queryByRole("link")).not.toBeInTheDocument();
    });

    it("shows the order as text without order.read", async () => {
      renderAs(PAYER, <PartnerPage />);
      const jobs = await jobsPanel();

      expect(await jobs.findByText("Order #1042 · line 2")).toBeInTheDocument();
      expect(jobs.queryByRole("link", { name: "Order #1042 · line 2" })).not.toBeInTheDocument();
    });

    it("shows a payout's jobs with their order", async () => {
      navigation.search = "tab=payouts";
      const user = userEvent.setup();
      renderAs(STAFF, <PartnerPage />);
      const payouts = within(await screen.findByRole("tabpanel", { name: "Payouts" }));
      const [pending] = await payouts.findAllByRole("button", { expanded: false });

      await user.click(pending!);

      const paidFor = within(screen.getByRole("list", { name: "Jobs this payout paid for" }));
      expect(paidFor.getByText("Charm · 10 pieces")).toBeInTheDocument();
      expect(paidFor.getByRole("link", { name: "Order #1042 · line 1" })).toHaveAttribute("href", ORDER_1042);
    });

    it("loads more jobs as it scrolls", async () => {
      const user = userEvent.setup();
      renderAs(STAFF, <PartnerPage />);
      const jobs = await jobsPanel();
      await jobs.findByText("Bangle · 12 pieces");
      expect(jobs.getAllByRole("listitem")).toHaveLength(20);

      await user.click(jobs.getByRole("button", { name: "Show more" }));

      await until(() => expect(jobs.getAllByRole("listitem")).toHaveLength(25));
      expect(jobs.getByText("Bracket batch 1 · 4 pieces")).toBeInTheDocument();
    });

    it("retries a part that failed", async () => {
      server.use(http.get(`${FAKE_API_URL}/partners/:id/owed`, () => HttpResponse.json({}, { status: 500 }), { once: true }));
      const user = userEvent.setup();
      renderAs(STAFF, <PartnerPage />);
      const jobs = await jobsPanel();

      expect(await jobs.findByText("This partner's jobs couldn't be loaded.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Northcast Foundry" })).toBeInTheDocument();

      await user.click(jobs.getByRole("button", { name: "Try again" }));

      expect(await jobs.findByText("Bangle · 12 pieces")).toBeInTheDocument();
    });
  });
});
