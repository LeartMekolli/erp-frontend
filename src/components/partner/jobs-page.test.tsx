import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";

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

describe("JobsPage", () => {
  it("lists jobs in progress", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Jobs" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "In progress" })).toHaveAttribute("aria-selected", "true");

    const ringBand = await screen.findByRole("link", { name: /^Ring band · Brass\b/ });
    expect(ringBand).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs/${RING_BAND_JOB_ID}`);
    expect(ringBand).toHaveTextContent("12 pieces");
    expect(ringBand).toHaveTextContent("2 of 12 done");
    expect(ringBand).toHaveTextContent("1 scrapped");
    expect(ringBand).toHaveTextContent("Due ");
    expect(ringBand).toHaveTextContent("€180.00");
    expect(screen.queryByRole("link", { name: /^Earring · Silver 925\b/ })).not.toBeInTheDocument();
  });

  it("switches to Finished in the address", async () => {
    const { unmount } = renderPage();
    await screen.findByRole("link", { name: /^Ring band · Brass\b/ });
    await userEvent.click(screen.getByRole("tab", { name: "Finished" }));
    expect(navigation.replace).toHaveBeenCalledWith(`/partner-portal/${NORTHCAST_ID}/jobs?tab=finished`, { scroll: false });
    unmount();

    navigation.search = "tab=finished";
    renderPage();
    const earring = await screen.findByRole("link", { name: /^Earring · Silver 925\b/ });
    expect(screen.getByRole("tab", { name: "Finished" })).toHaveAttribute("aria-selected", "true");
    expect(earring).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs/${EARRING_JOB_ID}`);
    expect(earring).toHaveTextContent("24 of 24 done");
    expect(earring).not.toHaveTextContent("scrapped");
    expect(screen.queryByRole("link", { name: /^Ring band · Brass\b/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "In progress" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(`/partner-portal/${NORTHCAST_ID}/jobs`, { scroll: false });
  });

  it("says when a tab is empty", async () => {
    server.use(http.get(JOBS_URL, ({ request }) => (new URL(request.url).searchParams.get("status") === "accepted" ? emptyPage() : undefined)));
    renderPage();
    expect(await screen.findByText("No jobs in progress. New offers appear above.")).toBeInTheDocument();
    // The offers are still there, so Finished isn't asked for.
    expect(screen.getByRole("heading", { name: "Waiting for your answer · 2" })).toBeInTheDocument();
    expect(requests.some((url) => url.searchParams.get("status") === "finished")).toBe(false);
    expect(screen.queryByText("No jobs yet. When staff offer you a job, it appears here.")).not.toBeInTheDocument();
  });

  it("says when there are no jobs at all", async () => {
    server.use(http.get(JOBS_URL, emptyPage));
    renderPage();
    expect(await screen.findByText("No jobs yet. When staff offer you a job, it appears here.")).toBeInTheDocument();
    expect(screen.queryByText("No jobs in progress. New offers appear above.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Waiting for your answer/ })).not.toBeInTheDocument();
    expect(requests.filter((url) => url.searchParams.get("status") === "finished")).toHaveLength(1);
  });

  it("doesn't say there are no jobs when the offers can't load", async () => {
    server.use(
      http.get(JOBS_URL, ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        if (status === "offered") return HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 });
        return status === "accepted" ? emptyPage() : undefined;
      }),
    );
    renderPage();
    const panel = await screen.findByRole("tabpanel", { name: "In progress" });
    expect(await within(panel).findByText("No jobs in progress. New offers appear above.")).toBeInTheDocument();
    expect(screen.getByText("Your offers couldn't be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("No jobs yet. When staff offer you a job, it appears here.")).not.toBeInTheDocument();
    expect(requests.some((url) => url.searchParams.get("status") === "finished")).toBe(false);
  });

  it("offers a retry when jobs can't load", async () => {
    let failing = true;
    server.use(
      http.get(JOBS_URL, ({ request }) =>
        failing && new URL(request.url).searchParams.get("status") === "accepted"
          ? HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })
          : undefined,
      ),
    );
    renderPage();
    const panel = await screen.findByRole("tabpanel", { name: "In progress" });
    expect(await within(panel).findByText("Your jobs couldn't be loaded.")).toBeInTheDocument();

    failing = false;
    await userEvent.click(within(panel).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /^Ring band · Brass\b/ })).toBeInTheDocument();
  });

  it("shows only this workshop's jobs", async () => {
    navigation.partnerId = LAYERLINE_ID;
    renderPage(PARTNER_TWO_SHOPS);
    expect(await screen.findByText("Facade panel · Standard resin")).toBeInTheDocument();
    expect(await screen.findByText("No jobs in progress. New offers appear above.")).toBeInTheDocument();

    expect(screen.queryByText(/Ring band/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ring · Silver 925/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pendant/)).not.toBeInTheDocument();
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) expect(url.pathname).toContain(`/partner-portal/partners/${LAYERLINE_ID}/`);
  });
});
