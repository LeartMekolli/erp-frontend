import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import { formatMoney } from "@/lib/format/money";

import { FAKE_API_URL, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER, type FakeUser } from "../../../test/fake-erp-api/seed";
import { resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { JobsTiles } from "./jobs-tiles";

vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/jobs`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const NOW = Date.parse("2026-11-12T10:00:00Z");
const JOBS_URL = `${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs`;

let requests: URL[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  resetFakeState();
  requests = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/partner-portal/partners/")) requests.push(url);
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
});

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderTiles(user: FakeUser = PARTNER, onReviewOffers = vi.fn()) {
  renderAs(
    user,
    <WithMe>
      <JobsTiles onReviewOffers={onReviewOffers} />
    </WithMe>,
  );
  return onReviewOffers;
}

const hero = async () => (await screen.findByRole("heading", { name: "Waiting for your answer" })).closest("section")!;

describe("JobsTiles", () => {
  it("counts the offers waiting and says when the first runs out", async () => {
    const onReview = renderTiles();
    const tile = await hero();

    await waitFor(() => expect(tile).toHaveTextContent("2 offers"));
    expect(within(tile).getByText("Urgent")).toBeInTheDocument();
    expect(tile).toHaveTextContent("First runs out in 1 h 30 min");
    await userEvent.click(within(tile).getByRole("button", { name: "Review" }));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("says 20+ when there are more offers than one page", async () => {
    const offer = {
      id: "c1c1c1c1-0000-4000-8000-000000000099",
      status: "offered",
      offered_at: "2026-11-12T09:00:00.000Z",
      expires_at: "2026-11-13T10:00:00.000Z",
      due_on: "2026-11-20",
      product: { name: "Ring" },
      options: [],
      quantity: 1,
      design_file_version_id: null,
      steps: [],
      cost: "10.00",
      pieces: { active: 1, finished: 0, scrapped: 0 },
    };
    server.use(
      http.get(JOBS_URL, ({ request }) =>
        new URL(request.url).searchParams.get("status") === "offered" ? HttpResponse.json({ data: [offer], next_cursor: "more" }) : undefined,
      ),
    );
    renderTiles();
    const tile = await hero();
    await waitFor(() => expect(tile).toHaveTextContent("20+ offers"));
  });

  it("says None without offers, and offers no Review", async () => {
    server.use(
      http.get(JOBS_URL, ({ request }) =>
        new URL(request.url).searchParams.get("status") === "offered" ? HttpResponse.json({ data: [], next_cursor: null }) : undefined,
      ),
    );
    renderTiles();
    const tile = await hero();
    await waitFor(() => expect(tile).toHaveTextContent("None"));
    expect(within(tile).queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  });

  it("shows an owner what's owed now, opening Earnings", async () => {
    renderTiles(PARTNER);
    const owed = await screen.findByRole("link", { name: /Owed now/ });
    expect(owed).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/earnings`);
    await waitFor(() => expect(owed).toHaveTextContent(formatMoney("1240.00", "EUR")));
  });

  it("shows a member nothing of what's owed, and never asks", async () => {
    renderTiles(NORTHCAST_MEMBER);
    await hero();
    await waitFor(() => expect(requests.some((url) => url.searchParams.get("status") === "offered")).toBe(true));
    expect(screen.queryByText("Owed now")).not.toBeInTheDocument();
    expect(requests.some((url) => url.pathname.endsWith("/owed"))).toBe(false);
  });
});
