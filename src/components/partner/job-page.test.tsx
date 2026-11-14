import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";

import type { PartnerJobDetail } from "@/lib/api/schema-types";

import { FACADE_OFFER_ID, LONG_NAME_JOB_ID, RING_BAND_JOB_ID, RING_OFFER_ID } from "../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { JobPage } from "./job-page";
import { PartnerNoticeLine, PartnerNoticeProvider } from "./notice";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), partnerId: "", groupId: "", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${navigation.partnerId}/jobs/${navigation.groupId}`,
  useParams: () => ({ partnerId: navigation.partnerId, groupId: navigation.groupId }),
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
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
  navigation.replace.mockReset();
  navigation.partnerId = NORTHCAST_ID;
  navigation.groupId = RING_OFFER_ID;
  navigation.search = "";
  freezeAt(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  server.events.removeAllListeners();
});

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
const DETAIL = `${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs/:groupId`;

/** The GET requests the page makes, by path. */
function watchRequests(): string[] {
  const asked: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "GET") asked.push(new URL(request.url).pathname);
  });
  return asked;
}

/** A new tab that the link opens into, as `openLink` asks the browser for one. */
function stubNewTab() {
  const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  return tab;
}

/** Ring band as the fake has it, with this AI brief. */
function serveBrief(summary: PartnerJobDetail["summary"]) {
  server.use(
    http.get(DETAIL, () => {
      const answer = fakeState().partnerJobs.detail(NORTHCAST_ID, RING_BAND_JOB_ID);
      if (!answer.ok) throw new Error("expected Ring band");
      return HttpResponse.json({ ...answer.body, summary });
    }),
  );
}

describe("JobPage", () => {
  it("shows an offer with its answers", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Ring · Silver 925" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", JOBS_PATH);
    expect(screen.getByText(/^10 pieces · Due .+ · You're paid €240\.00$/)).toBeInTheDocument();
    expect(screen.getByText("5 h 12 min left to answer")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeEnabled();
    expect(within(screen.getByRole("list", { name: "Your steps" })).getByText("Casting")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Design file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("fills in once accepted", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    expect(await screen.findByText("0 of 10 done")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pieces" })).toBeInTheDocument();
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

describe("JobPage: a job the partner holds", () => {
  beforeEach(() => {
    navigation.groupId = RING_BAND_JOB_ID;
  });

  it("shows an accepted job's steps and tabs", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Ring band · Brass" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Design file" })).toBeInTheDocument();
    const strip = screen.getByRole("list", { name: "Progress through the steps" });
    for (const name of ["Finish", "Not with you yet", "Your part done", "Finished", "Scrapped"]) expect(within(strip).getByText(name)).toBeInTheDocument();
    expect(within(strip).queryByText("Print")).not.toBeInTheDocument();
    // The scratched piece failed at Finish after the hand-over, so Quality counts it as staff's does.
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Pieces", "Quality 1 failed", "History", "Comments"]);
    expect(screen.queryByText(/coming soon/)).not.toBeInTheDocument();
  });

  it("opens the design file", async () => {
    const tab = stubNewTab();
    const asked = watchRequests();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Design file" }));
    await waitFor(() => expect(tab.location.href).toMatch(/^https:\/\/storage\.example\.test\//));
    expect(asked).toContain(`/partner-portal/partners/${NORTHCAST_ID}/jobs/${RING_BAND_JOB_ID}/design`);
  });

  it("downloads a step's instructions", async () => {
    const tab = stubNewTab();
    const asked = watchRequests();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Instructions for Finish" }));
    await waitFor(() => expect(tab.location.href).not.toBe(""));
    expect(asked).toContain(`/partner-portal/partners/${NORTHCAST_ID}/jobs/${RING_BAND_JOB_ID}/steps/finish/sop`);
  });

  it("offers no instructions for a step without them", async () => {
    navigation.groupId = LONG_NAME_JOB_ID;
    renderPage();
    expect(await screen.findByRole("list", { name: "Your steps" })).toHaveTextContent("Casting");
    expect(screen.queryByRole("button", { name: /^Instructions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Design file" })).not.toBeInTheDocument();
  });

  it("reads the brief", async () => {
    serveBrief({
      status: "done",
      description: "A brass ring band, 4 mm wide.",
      watch_outs: ["Thin walls near the seam"],
      recommendations: ["Polish before plating"],
      production_days: 3,
      used_history: true,
      created_at: new Date(NOW).toISOString(),
    });
    renderPage();
    const toggle = await screen.findByRole("button", { name: "AI brief" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("heading", { name: "What to make" })).toBeInTheDocument();
    expect(screen.getByText("A brass ring band, 4 mm wide.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Watch out for" })).toBeInTheDocument();
    expect(screen.getByText("Thin walls near the seam")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recommendations" })).toBeInTheDocument();
    expect(screen.getByText("About 3 working days")).toBeInTheDocument();
  });

  it("says the brief is being written", async () => {
    serveBrief({ status: "pending", description: null, watch_outs: null, recommendations: null, production_days: null, used_history: null, created_at: new Date(NOW).toISOString() });
    renderPage();
    expect(await screen.findByText("Writing the brief…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI brief" })).not.toBeInTheDocument();
  });

  it("shows no brief when there is none", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Ring band · Brass" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI brief" })).not.toBeInTheDocument();
    expect(screen.queryByText("Writing the brief…")).not.toBeInTheDocument();
  });

  it("names only the partner's own people", async () => {
    const detail = fakeState().partnerJobs.detail(NORTHCAST_ID, RING_BAND_JOB_ID);
    if (!detail.ok) throw new Error("expected Ring band");
    const piece = detail.body.work_orders.filter((one) => one.step_key === "finish")[1]!;
    fakeState().partnerJobs.move(
      NORTHCAST_ID,
      { kind: "pass", work_order_ids: [piece.id], at_step: "finish", answers: [{ item: "surface_smooth", value: true }], photo_file_version_ids: ["f1f1f1f1-0000-4000-8000-000000000001"] },
      null,
      { id: PARTNER.id, name: PARTNER.name },
    );
    navigation.search = "tab=history";
    renderPage();

    expect(await screen.findByText("Nora")).toBeInTheDocument();
    expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
    expect(screen.getByText("Came to you")).toBeInTheDocument();
    expect(screen.queryByText("Ana Ruiz")).not.toBeInTheDocument();
  });

  it("keeps the tab in the address", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "History" }));
    expect(navigation.replace).toHaveBeenCalledWith(`${JOBS_PATH}/${RING_BAND_JOB_ID}?tab=history`, { scroll: false });
  });
});
