import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RING_BAND_JOB_ID } from "../../../../test/fake-erp-api/partner-jobs";
import {
  FAKE_API_URL,
  LAYERLINE_ID,
  LAYERLINE_OWNER,
  NORTHCAST_ID,
  NORTHCAST_MEMBER,
  PARTNER,
  type FakeUser,
} from "../../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs, WithMe } from "../../../../test/render";
import { until } from "../../../../test/wait";

import { PartnerNoticeProvider } from "../notice";

import { EarningsPage } from "./earnings-page";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "", partnerId: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${navigation.partnerId}/earnings`,
  useParams: () => ({ partnerId: navigation.partnerId }),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const MEMBER_MESSAGE = "Only your workshop's owner and admins can see earnings.";

/** Every earnings route the page called. */
let requests: URL[] = [];
beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
  navigation.partnerId = NORTHCAST_ID;
  requests = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (/\/(owed|payouts|payout-account)/.test(url.pathname)) requests.push(url);
  });
});
afterEach(() => server.events.removeAllListeners());

function renderPage(user: FakeUser) {
  return renderAs(
    user,
    <WithMe>
      <PartnerNoticeProvider>
        <EarningsPage />
      </PartnerNoticeProvider>
    </WithMe>,
  );
}

describe("EarningsPage", () => {
  it("asks erp-api for nothing for a member", async () => {
    renderPage(NORTHCAST_MEMBER);

    expect(await screen.findByText(MEMBER_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Jobs" })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs`);
    expect(screen.getByRole("heading", { level: 1, name: "Earnings" })).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it("reads how setup ended once and drops it from the address", async () => {
    navigation.search = "onboarding=expired";
    renderPage(PARTNER);

    expect(await screen.findByText("That setup link ran out.")).toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledWith(`/partner-portal/${NORTHCAST_ID}/earnings`, { scroll: false });
  });

  describe("payouts and jobs", () => {
    // The fake's payouts are dated from the clock it starts on: the pending one the day before, 14 Nov.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: Date.parse("2026-11-15T10:00:00Z") });
      resetFakeState();
    });
    afterEach(() => vi.useRealTimers());

    const payoutRows = async () => within(await screen.findByRole("tabpanel", { name: "Payouts" })).findAllByRole("button", { expanded: false });

    it("lists payouts newest first", async () => {
      renderPage(PARTNER);
      const rows = await payoutRows();

      expect(rows).toHaveLength(3);
      for (const words of ["On its way", "14 Nov 2026", "€420.00", "2 jobs"]) expect(rows[0]).toHaveTextContent(words);
      expect(rows[1]).toHaveTextContent("Paid");
      expect(rows[2]).toHaveTextContent("Failed. Owed to you again");
    });

    it("opens a payout to show its jobs", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderPage(PARTNER);
      const [pending] = await payoutRows();

      await user.click(pending!);

      expect(pending).toHaveAttribute("aria-expanded", "true");
      const jobs = within(screen.getByRole("list", { name: "Jobs this payout paid for" }));
      expect(jobs.getByText("Charm · 10 pieces")).toBeInTheDocument();
      expect(jobs.getByText("€460.00")).toBeInTheDocument();
      expect(jobs.getByText("Taken back: €40.00")).toBeInTheDocument();
    });

    it("shows a failed payout and its money back", async () => {
      renderPage(PARTNER);
      await payoutRows();
      expect(await screen.findByText("€1,240.00")).toBeInTheDocument();

      fakeState().earnings.settlePending(NORTHCAST_ID, "failed");
      act(() => vi.advanceTimersByTime(15_000));

      await until(() => expect(screen.getByText("€1,660.00")).toBeInTheDocument());
      const rows = within(screen.getByRole("tabpanel", { name: "Payouts" })).getAllByRole("button", { expanded: false });
      expect(rows[0]).toHaveTextContent("Failed. Owed to you again");
      expect(screen.queryByText("On its way")).not.toBeInTheDocument();
    });

    // The address mock doesn't change on replace, so each test starts on the tab it leaves.
    it("puts the Jobs tab in the address", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderPage(PARTNER);
      await payoutRows();

      await user.click(screen.getByRole("tab", { name: "Jobs" }));

      expect(navigation.replace).toHaveBeenLastCalledWith(`/partner-portal/${NORTHCAST_ID}/earnings?tab=jobs`, { scroll: false });
    });

    it("leaves Payouts out of the address", async () => {
      navigation.search = "tab=jobs";
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderPage(PARTNER);
      await screen.findByRole("tabpanel", { name: "Jobs" });

      await user.click(screen.getByRole("tab", { name: "Payouts" }));

      expect(navigation.replace).toHaveBeenLastCalledWith(`/partner-portal/${NORTHCAST_ID}/earnings`, { scroll: false });
    });

    it("words and links each job", async () => {
      navigation.search = "tab=jobs";
      renderPage(PARTNER);
      const jobs = within(await screen.findByRole("tabpanel", { name: "Jobs" }));

      expect(await jobs.findByRole("link", { name: /^Ring band/ })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs/${RING_BAND_JOB_ID}`);
      expect(jobs.getByRole("link", { name: /^Ring band/ })).toHaveTextContent("Still being made");
      expect(jobs.getByRole("link", { name: /^Pendant/ })).toHaveTextContent("€120.00 taken off your next payout");
      expect(jobs.getByText("Taken back, nothing owed")).toBeInTheDocument();
      expect(jobs.queryByRole("link", { name: /^Cufflinks/ })).not.toBeInTheDocument();
      expect(jobs.getByRole("link", { name: /^Bangle/ })).toHaveTextContent("Owed");
    });

    it("shows when there's nothing yet", async () => {
      navigation.partnerId = LAYERLINE_ID;
      const { unmount } = renderPage(LAYERLINE_OWNER);
      expect(await screen.findByText("No payouts yet. The workspace pays what you're owed in one transfer.")).toBeInTheDocument();
      unmount();

      navigation.search = "tab=jobs";
      renderPage(LAYERLINE_OWNER);
      expect(await screen.findByText("No jobs yet. A job shows here once you accept it.")).toBeInTheDocument();
    });

    it("retries a part that failed", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      server.use(http.get(`${FAKE_API_URL}/partner-portal/partners/:partnerId/payouts`, () => HttpResponse.json({}, { status: 500 }), { once: true }));
      renderPage(PARTNER);

      expect(await screen.findByText("Your payouts couldn't be loaded.")).toBeInTheDocument();
      expect(screen.getByText("€1,240.00")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(await payoutRows()).toHaveLength(3);
    });
  });

  it("treats a 403 as not available", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/partner-portal/partners/:partnerId/owed`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Forbidden", status: 403, detail: "Your role can't do this" },
          { status: 403, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderPage(PARTNER);

    expect(await screen.findByText(MEMBER_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
