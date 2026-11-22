import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import { formatDate } from "@/lib/format/dates";

import { EARRING_JOB_ID, RING_BAND_JOB_ID } from "../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, LAYERLINE_ID, NORTHCAST_ID, PARTNER, PARTNER_TWO_SHOPS, type FakeUser } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { JobsPage } from "./jobs-page";
import { PartnerNoticeProvider } from "./notice";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "", partnerId: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${navigation.partnerId}/jobs`,
  useParams: () => ({ partnerId: navigation.partnerId }),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const JOBS_URL = `${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs`;
const JOBS = (id: string) => `/partner-portal/${id}/jobs`;

/** Every partner route the page called, as path and query. */
let requests: URL[] = [];
beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
  navigation.partnerId = NORTHCAST_ID;
  requests = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/partner-portal/partners/")) requests.push(url);
  });
});
afterEach(() => server.events.removeAllListeners());

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderPage(user: FakeUser = PARTNER) {
  return renderAs(
    user,
    <PartnerNoticeProvider>
      <WithMe>
        <JobsPage />
      </WithMe>
    </PartnerNoticeProvider>,
  );
}

const emptyPage = () => HttpResponse.json({ data: [], next_cursor: null });

/** The body row holding this text. */
async function row(text: string): Promise<HTMLElement> {
  await screen.findAllByText(text, { exact: false });
  const found = screen.getAllByRole("row").find((candidate) => candidate.textContent?.includes(text));
  if (!found) throw new Error(`no row with ${text}`);
  return found;
}

const statusOf = (url: URL) => url.searchParams.get("status");

describe("JobsPage", () => {
  it("opens on In progress, under the title, the date and the tiles", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Jobs" })).toBeInTheDocument();
    expect(screen.getByText(formatDate(new Date().toISOString(), "UTC"))).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Waiting for your answer" })).toBeInTheDocument();

    const list = screen.getByRole("region", { name: "Job list" });
    expect(within(list).getByRole("tab", { name: "In progress" })).toHaveAttribute("aria-selected", "true");
    expect(await within(list).findByRole("tab", { name: "Offers 2" })).toBeInTheDocument();
    expect(await row("Ring band · Brass")).toHaveTextContent("€180.00");
  });

  it("takes Review to the offers", async () => {
    renderPage();
    const hero = (await screen.findByRole("heading", { name: "Waiting for your answer" })).closest("section")!;
    await userEvent.click(await within(hero).findByRole("button", { name: "Review" }));
    expect(navigation.replace).toHaveBeenCalledWith(`${JOBS(NORTHCAST_ID)}?tab=offers`, { scroll: false });
  });

  it("shows the offers on ?tab=offers", async () => {
    navigation.search = "tab=offers";
    renderPage();
    expect(await screen.findByRole("table", { name: "Offers waiting for your answer" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Offers 2" })).toHaveAttribute("aria-selected", "true");
    expect(await row("Ring · Silver 925")).toHaveTextContent("Answer by");
  });

  it("switches to Finished in the address", async () => {
    const { unmount } = renderPage();
    await row("Ring band · Brass");
    await userEvent.click(screen.getByRole("tab", { name: "Finished" }));
    expect(navigation.replace).toHaveBeenCalledWith(`${JOBS(NORTHCAST_ID)}?tab=finished`, { scroll: false });
    unmount();

    navigation.search = "tab=finished";
    renderPage();
    const earring = await row("Earring · Silver 925");
    expect(screen.getByRole("tab", { name: "Finished" })).toHaveAttribute("aria-selected", "true");
    expect(within(earring).getAllByRole("link", { name: "Earring · Silver 925" })[0]).toHaveAttribute("href", `${JOBS(NORTHCAST_ID)}/${EARRING_JOB_ID}`);
    expect(earring).toHaveTextContent("24 of 24 done");
    expect(earring).not.toHaveTextContent("Late");

    await userEvent.click(screen.getByRole("tab", { name: "In progress" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(JOBS(NORTHCAST_ID), { scroll: false });
  });

  it("says when In progress is empty, without asking for Finished while there are offers", async () => {
    server.use(http.get(JOBS_URL, ({ request }) => (statusOf(new URL(request.url)) === "accepted" ? emptyPage() : undefined)));
    renderPage();
    expect(await screen.findByText("No jobs in progress.")).toBeInTheDocument();
    expect(requests.some((url) => statusOf(url) === "finished")).toBe(false);
    expect(screen.queryByText(/No jobs yet/)).not.toBeInTheDocument();
  });

  it("says when there are no jobs at all", async () => {
    server.use(http.get(JOBS_URL, emptyPage));
    renderPage();
    expect(await screen.findByText("No jobs yet. When staff offer you a job, it appears under Offers.")).toBeInTheDocument();
    expect(screen.queryByText("No jobs in progress.")).not.toBeInTheDocument();
    expect(requests.filter((url) => statusOf(url) === "finished")).toHaveLength(1);
  });

  it("doesn't say there are no jobs when the offers can't load", async () => {
    server.use(
      http.get(JOBS_URL, ({ request }) => {
        const status = statusOf(new URL(request.url));
        if (status === "offered") return HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 });
        return status === "accepted" ? emptyPage() : undefined;
      }),
    );
    renderPage();
    expect(await screen.findByText("No jobs in progress.")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load your offers.")).toBeInTheDocument();
    expect(screen.queryByText(/No jobs yet/)).not.toBeInTheDocument();
  });

  it("says when there are no offers on the Offers tab", async () => {
    navigation.search = "tab=offers";
    server.use(http.get(JOBS_URL, ({ request }) => (statusOf(new URL(request.url)) === "offered" ? emptyPage() : undefined)));
    renderPage();
    expect(await screen.findByText("No offers waiting.")).toBeInTheDocument();
  });

  it("shows only this workshop's jobs", async () => {
    navigation.partnerId = LAYERLINE_ID;
    navigation.search = "tab=offers";
    renderPage(PARTNER_TWO_SHOPS);
    expect(await row("Facade panel · Standard resin")).toBeInTheDocument();
    expect(screen.queryByText(/Ring band/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pendant/)).not.toBeInTheDocument();
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) expect(url.pathname).toContain(`/partner-portal/partners/${LAYERLINE_ID}/`);
  });

  it("keeps a job's link to its page", async () => {
    renderPage();
    const ringBand = await row("Ring band · Brass");
    expect(within(ringBand).getAllByRole("link", { name: "Ring band · Brass" })[0]).toHaveAttribute("href", `${JOBS(NORTHCAST_ID)}/${RING_BAND_JOB_ID}`);
  });
});
