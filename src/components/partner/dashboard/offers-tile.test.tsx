import { act, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PartnerJob } from "@/lib/api/schema-types";

import { PENDANT_OFFER_ID } from "../../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER } from "../../../../test/fake-erp-api/seed";
import { resetFakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs, WithMe } from "../../../../test/render";

import { offerLeft, OffersTile } from "./offers-tile";

vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/dashboard`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const NOW = Date.parse("2026-11-24T10:00:00Z");
const HOUR = 3_600_000;
const JOBS_URL = `${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs`;

beforeEach(() => {
  // The time left is worded again on an interval; moving it by hand moves the clock with it.
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: NOW });
  resetFakeState();
});
afterEach(() => vi.useRealTimers());

function offer(n: number, hoursLeft: number | null, name = `Offer ${n}`): PartnerJob {
  return {
    id: `c1c1c1c1-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    status: "offered",
    offered_at: new Date(NOW - HOUR).toISOString(),
    expires_at: hoursLeft === null ? null : new Date(NOW + hoursLeft * HOUR).toISOString(),
    due_on: "2026-12-04",
    product: { name },
    options: [],
    quantity: 2,
    design_file_version_id: null,
    steps: [],
    cost: "120.00",
    pieces: { active: 2, finished: 0, scrapped: 0 },
  };
}

function offersAre(jobs: PartnerJob[]) {
  server.use(http.get(JOBS_URL, () => HttpResponse.json({ data: jobs, next_cursor: null })));
}

function renderTile() {
  return renderAs(
    PARTNER,
    <WithMe>
      <OffersTile />
    </WithMe>,
  );
}

const tile = () => screen.findByRole("region", { name: /^Offers waiting for you/ });

describe("offerLeft", () => {
  it("is the share of the offer's time still to go", () => {
    const job = { offered_at: new Date(NOW - 10 * HOUR).toISOString(), expires_at: new Date(NOW + 2 * HOUR).toISOString() };
    expect(offerLeft(job, NOW)).toBeCloseTo(2 / 12, 5);
  });

  it("is nothing without a deadline, and 0 once it's past", () => {
    expect(offerLeft({ offered_at: new Date(NOW - HOUR).toISOString(), expires_at: null }, NOW)).toBeNull();
    expect(offerLeft({ offered_at: new Date(NOW - 2 * HOUR).toISOString(), expires_at: new Date(NOW - HOUR).toISOString() }, NOW)).toBe(0);
  });
});

describe("OffersTile", () => {
  it("lists the offers soonest deadline first, each with its job and a way in", async () => {
    renderTile();
    const region = await tile();
    await waitFor(() => expect(within(region).getAllByRole("listitem")).toHaveLength(2));
    const [first, second] = within(region).getAllByRole("listitem");
    expect(first).toHaveTextContent("Pendant · Gold 18k");
    expect(first).toHaveTextContent("1h");
    expect(first).toHaveTextContent("1 h 30 min left to answer");
    expect(first).toHaveTextContent("3 pieces · due");
    expect(first).toHaveTextContent("€410.00");
    expect(within(first!).getByRole("link", { name: /Open/ })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs/${PENDANT_OFFER_ID}`);
    expect(second).toHaveTextContent("Ring · Silver 925");
    expect(region).toHaveTextContent(/Offers waiting for you\s*2/);
    expect(within(region).queryByRole("link", { name: "All offers" })).toBeNull();
  });

  it("drops an offer when its time runs out, and counts one fewer", async () => {
    renderTile();
    const region = await tile();
    await waitFor(() => expect(within(region).getAllByRole("listitem")).toHaveLength(2));

    act(() => vi.advanceTimersByTime(91 * 60_000));

    await waitFor(() => expect(within(region).getAllByRole("listitem")).toHaveLength(1));
    expect(region).not.toHaveTextContent("Pendant");
    expect(region).toHaveTextContent(/Offers waiting for you\s*1/);
  });

  it("shows at most three, and links to them all when there are more", async () => {
    offersAre([offer(1, 30), offer(2, 3), offer(3, 20), offer(4, 9)]);
    renderTile();
    const region = await tile();
    await waitFor(() => expect(within(region).getAllByRole("listitem")).toHaveLength(3));
    expect(within(region).getAllByRole("listitem").map((item) => item.textContent?.match(/Offer \d/)?.[0])).toEqual(["Offer 2", "Offer 4", "Offer 3"]);
    expect(within(region).getByRole("link", { name: "All offers" })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs`);
  });

  it("reads No deadline, with no ring, for an offer that has none", async () => {
    offersAre([offer(1, null, "Bracket")]);
    renderTile();
    const region = await tile();
    const item = await within(region).findByRole("listitem");
    expect(item).toHaveTextContent("No deadline");
    expect(item.querySelector("[data-arc]")).toBeNull();
  });

  it("words a failure in the tile's own ink, which keeps AA contrast on lilac", async () => {
    server.use(http.get(JOBS_URL, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500, headers: { "content-type": "application/problem+json" } })));
    renderTile();
    const failure = await within(await tile()).findByText("Couldn't load your offers.");
    // `text-ink-2` (#67647a) is about 4.3:1 on the lilac gradient's darker end; the tile's #4d4570 is over 7:1.
    expect(failure).toHaveClass("text-[#4d4570]");
    expect(failure).not.toHaveClass("text-ink-2");
  });

  it("looks past a page of offers that have all run out, so the count and the list agree", async () => {
    const expired = Array.from({ length: 20 }, (_, i) => ({ ...offer(i + 1, -1), offered_at: new Date(NOW - 3 * HOUR).toISOString() }));
    server.use(
      http.get(JOBS_URL, ({ request }) =>
        new URL(request.url).searchParams.get("cursor")
          ? HttpResponse.json({ data: [offer(30, 5, "Late find")], next_cursor: null })
          : HttpResponse.json({ data: expired, next_cursor: "20" }),
      ),
    );
    renderTile();
    const region = await tile();
    // The job's name, not the Open link's hidden "Late find".
    expect(await within(region).findByText("Late find", { selector: "p" })).toBeInTheDocument();
    expect(region).toHaveTextContent(/Offers waiting for you\s*1/);
    expect(region).not.toHaveTextContent("No offers waiting.");
  });

  it("says so when no offer is waiting", async () => {
    offersAre([]);
    renderTile();
    expect(await within(await tile()).findByText("No offers waiting.")).toBeInTheDocument();
  });
});
