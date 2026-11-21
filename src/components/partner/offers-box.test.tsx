import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";

import { FACADE_OFFER_ID, RING_OFFER_ID } from "../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, LAYERLINE_ID, LAYERLINE_OWNER, NORTHCAST_ID, PARTNER, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { PartnerNoticeLine, PartnerNoticeProvider } from "./notice";
import { OffersBox } from "./offers-box";

let partnerId = NORTHCAST_ID;
vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${partnerId}/jobs`,
  useParams: () => ({ partnerId }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const NOW = Date.parse("2026-11-12T10:00:00Z");
const MINUTE = 60_000;

/** Freezes the clock and starts the fake over on it, so the fake's deadlines and AMI's countdown agree to the second. */
function freezeAt(now: number, toFake: ("Date" | "setInterval" | "clearInterval")[] = ["Date"]) {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake, now });
  resetFakeState();
}

let posts: string[] = [];
beforeEach(() => {
  partnerId = NORTHCAST_ID;
  freezeAt(NOW);
  posts = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && /\/jobs\/[^/]+\/(accept|decline)$/.test(request.url)) posts.push(new URL(request.url).pathname);
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
});

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderBox(user: FakeUser = PARTNER) {
  return renderAs(
    user,
    <PartnerNoticeProvider>
      <WithMe>
        <OffersBox />
      </WithMe>
      <PartnerNoticeLine />
    </PartnerNoticeProvider>,
  );
}

/** The partner shell's notice line, once it says this. */
async function noticeSaying(text: string): Promise<HTMLElement> {
  const line = (await screen.findByText(text)).closest<HTMLElement>("[role=status]");
  if (!line) throw new Error(`no notice line around ${text}`);
  return line;
}

/** The card of the offer with this title. */
async function offer(title: string): Promise<HTMLElement> {
  const card = (await screen.findByText(title)).closest("li");
  if (!card) throw new Error(`no card for ${title}`);
  return card;
}

const declinePath = (jobId: string) => `/partner-portal/partners/${partnerId}/jobs/${jobId}/decline`;

describe("OffersBox", () => {
  it("lists offers with pay and time left", async () => {
    renderBox();
    expect(await screen.findByRole("heading", { name: "Waiting for your answer · 2" })).toBeInTheDocument();

    const ring = await offer("Ring · Silver 925");
    expect(within(ring).getByRole("link", { name: "Ring · Silver 925" })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs/${RING_OFFER_ID}`);
    expect(within(ring).getByText(/You're paid €240\.00/)).toBeInTheDocument();
    expect(within(ring).getByText(/^Due /)).toBeInTheDocument();
    expect(within(ring).getByText("5 h 12 min left to answer")).toBeInTheDocument();
    expect(within(ring).queryByText("Urgent")).not.toBeInTheDocument();
    expect(within(ring).getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(within(ring).getByRole("button", { name: "Decline" })).toBeEnabled();

    const pendant = await offer("Pendant · Gold 18k");
    expect(within(pendant).getByText("Urgent")).toBeInTheDocument();
    expect(within(pendant).getByText("1 h 30 min left to answer")).toBeInTheDocument();
  });

  it("moves focus to the notice after declining", async () => {
    renderBox();
    const ring = await offer("Ring · Silver 925");
    await userEvent.click(within(ring).getByRole("button", { name: "Decline" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Decline this job?" })).getByRole("button", { name: "Decline job" }));

    const line = await noticeSaying("You declined Ring · Silver 925.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "Waiting for your answer · 1" })).toBeInTheDocument();
    // The dialog doesn't hand focus back to Decline: its offer is gone.
    await waitFor(() => expect(line).toHaveFocus());
  });

  it("asks before declining", async () => {
    renderBox();
    const ring = await offer("Ring · Silver 925");

    await userEvent.click(within(ring).getByRole("button", { name: "Decline" }));
    let dialog = await screen.findByRole("dialog", { name: "Decline this job?" });
    expect(within(dialog).getByText("Staff will offer it to someone else. You can't undo this.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts).toEqual([]);

    await userEvent.click(within(ring).getByRole("button", { name: "Decline" }));
    dialog = await screen.findByRole("dialog", { name: "Decline this job?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Decline job" }));

    expect(await screen.findByText("You declined Ring · Silver 925.")).toBeInTheDocument();
    expect(posts).toEqual([declinePath(RING_OFFER_ID)]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "Waiting for your answer · 1" })).toBeInTheDocument();
  });

  it("says when offers can't be loaded", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs`, ({ request }) =>
        new URL(request.url).searchParams.get("status") === "offered"
          ? HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })
          : undefined,
      ),
    );
    renderBox();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("Your offers couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Waiting for your answer" })).toBeInTheDocument();
  });

  it("lets an offer go when its time runs out", async () => {
    // useNow ticks on setInterval; setTimeout stays real, so Testing Library's waits still run.
    freezeAt(NOW, ["Date", "setInterval", "clearInterval"]);
    renderBox();
    await offer("Pendant · Gold 18k");
    expect(await screen.findByRole("heading", { name: "Waiting for your answer · 2" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(90 * MINUTE + 15_000));

    expect(screen.queryByText("Pendant · Gold 18k")).not.toBeInTheDocument();
    expect(screen.getByText("Time ran out on Pendant · Gold 18k.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Waiting for your answer · 1" })).toBeInTheDocument();
    expect(screen.getByText("Ring · Silver 925")).toBeInTheDocument();
    expect(screen.queryByText("Time ran out on Ring · Silver 925.")).not.toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it("moves focus to the notice only when the run-out offer had it", async () => {
    freezeAt(NOW, ["Date", "setInterval", "clearInterval"]);
    renderBox();
    const ring = await offer("Ring · Silver 925");
    const pendant = await offer("Pendant · Gold 18k");

    // Focus on another offer stays there.
    act(() => within(ring).getByRole("button", { name: "Accept" }).focus());
    act(() => vi.advanceTimersByTime(90 * MINUTE + 15_000));
    expect(screen.getByText("Time ran out on Pendant · Gold 18k.")).toBeInTheDocument();
    expect(within(ring).getByRole("button", { name: "Accept" })).toHaveFocus();
    expect(pendant).not.toBeInTheDocument();

    // Focus inside the run-out offer's decline dialog goes to the notice.
    await userEvent.click(within(ring).getByRole("button", { name: "Decline" }));
    await screen.findByRole("dialog", { name: "Decline this job?" });
    act(() => vi.advanceTimersByTime(5 * 60 * MINUTE + 12 * MINUTE - 90 * MINUTE));
    const line = await noticeSaying("Time ran out on Ring · Silver 925.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(line).toHaveFocus());
  });

  it("hides the answers while suspended", async () => {
    fakeState().suspendPartner(NORTHCAST_ID);
    const { client } = renderBox();
    await offer("Ring · Silver 925");
    await offer("Pendant · Gold 18k");
    await waitFor(() => expect(client.getQueryData(["partner-portal", "me"])).toBeDefined());

    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Waiting for your answer · 2" })).toBeInTheDocument();
  });

  it("shows nothing without offers", async () => {
    partnerId = LAYERLINE_ID;
    renderBox(LAYERLINE_OWNER);
    const facade = await offer("Facade panel · Standard resin");
    expect(within(facade).getByRole("link", { name: "Facade panel · Standard resin" })).toHaveAttribute(
      "href",
      `/partner-portal/${LAYERLINE_ID}/jobs/${FACADE_OFFER_ID}`,
    );

    await userEvent.click(within(facade).getByRole("button", { name: "Decline" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Decline this job?" })).getByRole("button", { name: "Decline job" }));

    expect(await screen.findByText("You declined Facade panel · Standard resin.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Waiting for your answer/ })).not.toBeInTheDocument());
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(posts).toEqual([declinePath(FACADE_OFFER_ID)]);
  });
});
