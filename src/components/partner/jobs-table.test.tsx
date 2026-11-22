import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { PartnerJob } from "@/lib/api/schema-types";

import { LONG_NAME_JOB_ID, RING_BAND_JOB_ID } from "../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { JobsTable } from "./jobs-table";
import { PartnerNoticeLine, PartnerNoticeProvider } from "./notice";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/jobs`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: navigation.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

const NOW = Date.parse("2026-11-12T10:00:00Z");
const MINUTE = 60_000;
const JOBS_URL = `${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs`;
const jobHref = (id: string) => `/partner-portal/${NORTHCAST_ID}/jobs/${id}`;

/** Freezes the clock and starts the fake over on it, so the fake's deadlines and AMI's countdown agree. */
function freezeAt(now: number, toFake: ("Date" | "setInterval" | "clearInterval")[] = ["Date"]) {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake, now });
  resetFakeState();
}

beforeEach(() => {
  navigation.push.mockReset();
  freezeAt(NOW);
});
afterEach(() => vi.useRealTimers());

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderTable(tab: "offers" | "progress" | "finished", empty = "Nothing here.") {
  return renderAs(
    PARTNER,
    <PartnerNoticeProvider>
      <WithMe>
        <JobsTable tab={tab} empty={empty} />
      </WithMe>
      <PartnerNoticeLine />
    </PartnerNoticeProvider>,
  );
}

/** The body row holding this text. */
async function row(text: string): Promise<HTMLElement> {
  await screen.findAllByText(text, { exact: false });
  const found = screen.getAllByRole("row").find((candidate) => candidate.textContent?.includes(text));
  if (!found) throw new Error(`no row with ${text}`);
  return found;
}

const late: PartnerJob = {
  id: "c1c1c1c1-0000-4000-8000-000000000077",
  status: "accepted",
  offered_at: "2026-11-01T09:00:00.000Z",
  expires_at: null,
  due_on: "2026-11-10",
  product: { name: "Pendant" },
  options: [{ group: "Material", value: "Brass" }],
  quantity: 30,
  design_file_version_id: null,
  steps: [{ key: "casting", name: "Casting", sop_file_version_id: null }],
  cost: "900.00",
  pieces: { active: 28, finished: 0, scrapped: 2 },
};

describe("JobsTable", () => {
  it("lists jobs in progress as a table", async () => {
    renderTable("progress");
    const table = await screen.findByRole("table", { name: "Your jobs" });
    for (const name of ["Job", "Pieces", "Progress", "Due", "Pay"]) {
      expect(within(table).getByRole("columnheader", { name })).toBeInTheDocument();
    }

    const ringBand = await row("Ring band · Brass");
    expect(ringBand).toHaveTextContent("12");
    expect(ringBand).toHaveTextContent(/of 12 done/);
    expect(ringBand).toHaveTextContent("1 lost");
    expect(ringBand).toHaveTextContent("€180.00");
    expect(within(ringBand).getAllByRole("link", { name: "Ring band · Brass" })[0]).toHaveAttribute("href", jobHref(RING_BAND_JOB_ID));
  });

  it("says how late a job is, in words", async () => {
    server.use(
      http.get(JOBS_URL, ({ request }) =>
        new URL(request.url).searchParams.get("status") === "accepted" ? HttpResponse.json({ data: [late], next_cursor: null }) : undefined,
      ),
    );
    renderTable("progress");
    const pendant = await row("Pendant · Brass");
    expect(pendant).toHaveTextContent("Late · 2 days");
    expect(pendant).toHaveTextContent("2 lost");
  });

  it("opens a job from the keyboard and by clicking its row", async () => {
    renderTable("progress");
    const first = await row("Brushed satin");
    const ringBand = await row("Ring band · Brass");

    act(() => first.focus());
    await userEvent.keyboard("j");
    expect(ringBand).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(navigation.push).toHaveBeenLastCalledWith(jobHref(RING_BAND_JOB_ID));

    await userEvent.click(within(first).getAllByText("4")[0]!);
    expect(navigation.push).toHaveBeenLastCalledWith(jobHref(LONG_NAME_JOB_ID));
  });

  it("lists offers with their deadline and answers, which don't open the job", async () => {
    renderTable("offers");
    expect(await screen.findByRole("table", { name: "Offers waiting for your answer" })).toBeInTheDocument();
    const ring = await row("Ring · Silver 925");
    expect(ring).toHaveTextContent("Answer by 12 Nov 2026, 15:12");
    expect(ring).toHaveTextContent("5 h 12 min left to answer");
    expect(ring).toHaveTextContent("€240.00");

    await userEvent.click(within(ring).getByRole("button", { name: "Decline" }));
    expect(await screen.findByRole("dialog", { name: "Decline this job?" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("lets an offer go when its time runs out, and says so once", async () => {
    // useNow ticks on setInterval; setTimeout stays real, so Testing Library's waits still run.
    freezeAt(NOW, ["Date", "setInterval", "clearInterval"]);
    renderTable("offers");
    await row("Pendant · Gold 18k");

    act(() => vi.advanceTimersByTime(90 * MINUTE + 15_000));

    expect(screen.getAllByRole("row").some((candidate) => candidate.textContent?.includes("Pendant · Gold 18k"))).toBe(false);
    expect(screen.getAllByText("Time ran out on Pendant · Gold 18k.")).toHaveLength(1);
    expect(await row("Ring · Silver 925")).toBeInTheDocument();
  });

  it("keeps an offer whose answer is on its way, and never says its time ran out", async () => {
    freezeAt(NOW, ["Date", "setInterval", "clearInterval"]);
    // Open the table a minute before the Pendant's deadline (90 min), so the fake's 15-minute sign-in still holds for the answer.
    vi.setSystemTime(NOW + 89 * MINUTE);
    // The answer waits here until let go; then the fake answers it as erp-api would.
    let letGo = () => {};
    const held = new Promise<void>((resolve) => (letGo = resolve));
    server.use(
      http.post(`${JOBS_URL}/:groupId/accept`, async () => {
        await held;
      }),
    );
    renderTable("offers");
    const pendant = await row("Pendant · Gold 18k");

    await userEvent.click(within(pendant).getByRole("button", { name: "Accept" }));
    const dialog = await screen.findByRole("dialog", { name: "Take Pendant · Gold 18k?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Accept job" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Accept job" })).toBeDisabled());

    // The deadline passes while the answer is sending: the offer and its dialog stay, and nothing is said.
    act(() => vi.advanceTimersByTime(MINUTE + 15_000));
    expect(screen.getByRole("dialog", { name: "Take Pendant · Gold 18k?" })).toBeInTheDocument();
    expect(screen.queryByText("Time ran out on Pendant · Gold 18k.")).not.toBeInTheDocument();

    // erp-api's answer is the one the partner reads, whichever it is.
    act(() => letGo());
    expect(await screen.findByText(/^(Pendant · Gold 18k is yours\.|This offer is no longer open\.)$/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByText("Time ran out on Pendant · Gold 18k.")).not.toBeInTheDocument();
  });

  it("moves focus to the notice only when the run-out offer had it", async () => {
    freezeAt(NOW, ["Date", "setInterval", "clearInterval"]);
    renderTable("offers");
    const ring = await row("Ring · Silver 925");
    await row("Pendant · Gold 18k");

    act(() => within(ring).getByRole("button", { name: "Accept" }).focus());
    act(() => vi.advanceTimersByTime(90 * MINUTE + 15_000));
    expect(screen.getByText("Time ran out on Pendant · Gold 18k.")).toBeInTheDocument();
    expect(within(ring).getByRole("button", { name: "Accept" })).toHaveFocus();

    await userEvent.click(within(ring).getByRole("button", { name: "Decline" }));
    await screen.findByRole("dialog", { name: "Decline this job?" });
    act(() => vi.advanceTimersByTime(5 * 60 * MINUTE + 12 * MINUTE - 90 * MINUTE));
    const line = (await screen.findByText("Time ran out on Ring · Silver 925.")).closest<HTMLElement>("[role=status]")!;
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(line).toHaveFocus());
  });

  it("says when a tab is empty", async () => {
    server.use(http.get(JOBS_URL, () => HttpResponse.json({ data: [], next_cursor: null })));
    renderTable("finished", "No finished jobs yet.");
    expect(await screen.findByText("No finished jobs yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("offers a retry when jobs can't load", async () => {
    let failing = true;
    server.use(
      http.get(JOBS_URL, () => (failing ? HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 }) : undefined)),
    );
    renderTable("progress");
    expect(await screen.findByText("Your jobs couldn't be loaded.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await row("Ring band · Brass")).toBeInTheDocument();
  });
});
