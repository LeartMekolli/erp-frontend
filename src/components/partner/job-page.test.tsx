import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";

import { FACADE_OFFER_ID, RING_OFFER_ID } from "../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { JobPage } from "./job-page";
import { PartnerNoticeLine, PartnerNoticeProvider } from "./notice";

const navigation = vi.hoisted(() => ({ push: vi.fn(), partnerId: "", groupId: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${navigation.partnerId}/jobs/${navigation.groupId}`,
  useParams: () => ({ partnerId: navigation.partnerId, groupId: navigation.groupId }),
  useRouter: () => ({ push: navigation.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

const NOW = Date.parse("2026-11-12T10:00:00Z");
const MINUTE = 60_000;

/** Freezes the clock and starts the fake over on it, so the fake's deadlines and AMI's countdown agree to the second. */
function freezeAt(now: number, toFake: ("Date" | "setInterval" | "clearInterval")[] = ["Date"]) {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake, now });
  resetFakeState();
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.partnerId = NORTHCAST_ID;
  navigation.groupId = RING_OFFER_ID;
  freezeAt(NOW);
});
afterEach(() => vi.useRealTimers());

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderPage() {
  return renderAs(
    PARTNER,
    <PartnerNoticeProvider>
      <WithMe>
        <JobPage />
      </WithMe>
      <PartnerNoticeLine />
    </PartnerNoticeProvider>,
  );
}

const JOBS_PATH = `/partner-portal/${NORTHCAST_ID}/jobs`;
const COMING_SOON = "Pieces, quality, history and comments for this job are coming soon.";

describe("JobPage", () => {
  it("shows an offer with its answers", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Ring · Silver 925" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", JOBS_PATH);
    expect(screen.getByText(/^10 pieces · Due .+ · You're paid €240\.00$/)).toBeInTheDocument();
    expect(screen.getByText("5 h 12 min left to answer")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeEnabled();
    expect(screen.queryByText(COMING_SOON)).not.toBeInTheDocument();
  });

  it("fills in once accepted", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    expect(await screen.findByText("0 of 10 done")).toBeInTheDocument();
    expect(screen.getByText(COMING_SOON)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByText(/left to answer/)).not.toBeInTheDocument();
    expect(screen.getByText("Ring · Silver 925 is yours.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Ring · Silver 925" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("goes back to Jobs after declining", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    const dialog = await screen.findByRole("dialog", { name: "Decline this job?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Decline job" }));

    expect(await screen.findByText("You declined Ring · Silver 925.")).toBeInTheDocument();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(JOBS_PATH));
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("This job isn't yours any more, or doesn't exist.")).not.toBeInTheDocument();
  });

  it("hides the answers while suspended", async () => {
    fakeState().suspendPartner(NORTHCAST_ID);
    const { client } = renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Ring · Silver 925" })).toBeInTheDocument();
    await waitFor(() => expect(client.getQueryData(["partner-portal", "me"])).toBeDefined());

    expect(screen.getByText("5 h 12 min left to answer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
  });

  it("says when the job isn't theirs", async () => {
    navigation.groupId = FACADE_OFFER_ID;
    renderPage();

    expect(await screen.findByText("This job isn't yours any more, or doesn't exist.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Jobs" })).toHaveAttribute("href", JOBS_PATH);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Job$/);
  });

  it("lets go of an offer whose time runs out", async () => {
    // useNow ticks on setInterval; setTimeout stays real, so the fetches and Testing Library's waits still run.
    freezeAt(NOW, ["Date", "setInterval", "clearInterval"]);
    // Open the page a minute before the Ring's deadline (5 h 12 min), so the fake's 15-minute sign-in still holds for the refetch.
    vi.setSystemTime(NOW + 5 * 60 * MINUTE + 11 * MINUTE);
    renderPage();
    expect(await screen.findByText("1 min left to answer")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Accept" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(MINUTE + 15_000));

    // The fake lets the offer go at its deadline, as erp-api does: the refetch is a 404.
    expect(await screen.findByText("This job isn't yours any more, or doesn't exist.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("says when the job can't be loaded", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs/:groupId`, () =>
        HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 }),
      ),
    );
    renderPage();

    expect(await screen.findByText("This job couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Job" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
