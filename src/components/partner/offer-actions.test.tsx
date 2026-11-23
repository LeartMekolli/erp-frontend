import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { PartnerJob } from "@/lib/api/schema-types";

import { RING_OFFER_ID } from "../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { PartnerNoticeLine, PartnerNoticeProvider } from "./notice";
import { OfferActions } from "./offer-actions";

vi.mock("next/navigation", () => ({
  usePathname: () => `/partner-portal/${NORTHCAST_ID}/jobs`,
  useParams: () => ({ partnerId: NORTHCAST_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const NOW = Date.parse("2026-11-12T10:00:00Z");

/** The fake's Ring offer, as the Jobs list holds it. */
const RING: PartnerJob = {
  id: RING_OFFER_ID,
  status: "offered",
  offered_at: "2026-11-12T09:00:00.000Z",
  expires_at: "2026-11-12T15:12:00.000Z",
  due_on: "2026-11-20",
  product: { name: "Ring" },
  options: [{ group: "Material", value: "Silver 925" }],
  quantity: 10,
  design_file_version_id: null,
  steps: [
    { key: "print_pattern", name: "Print pattern", sop_file_version_id: null, count: 0 },
    { key: "casting", name: "Casting", sop_file_version_id: null, count: 0 },
  ],
  cost: "240.00",
  pieces: { active: 10, finished: 0, scrapped: 0 },
};

let posts: string[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  resetFakeState();
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

function renderActions() {
  return renderAs(
    PARTNER,
    <PartnerNoticeProvider>
      <WithMe>
        <OfferActions job={RING} />
      </WithMe>
      <PartnerNoticeLine />
    </PartnerNoticeProvider>,
  );
}

const acceptPath = `/partner-portal/partners/${NORTHCAST_ID}/jobs/${RING_OFFER_ID}/accept`;

async function openAccept() {
  await userEvent.click(await screen.findByRole("button", { name: "Accept" }));
  return screen.findByRole("dialog", { name: "Take Ring · Silver 925?" });
}

describe("OfferActions", () => {
  it("asks before accepting, with what the job is", async () => {
    renderActions();
    const dialog = await openAccept();

    expect(within(dialog).getByText("10 pieces, due 20 Nov 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("€240.00 for 10 pieces")).toBeInTheDocument();
    expect(within(dialog).getByText("Your steps: Print pattern → Casting")).toBeInTheDocument();
    expect(within(dialog).getByText("Answer by 12 Nov 2026, 15:12")).toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it("sends nothing on Not now, and gives focus back to Accept", async () => {
    renderActions();
    const dialog = await openAccept();
    await userEvent.click(within(dialog).getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts).toEqual([]);
    // The dialog hands focus back once it has gone.
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toHaveFocus());
  });

  it("accepts once on a double click, and shows the win as a band", async () => {
    renderActions();
    const dialog = await openAccept();
    await userEvent.dblClick(within(dialog).getByRole("button", { name: "Accept job" }));

    const won = await screen.findByText("Ring · Silver 925 is yours.");
    expect(posts).toEqual([acceptPath]);
    expect(won.closest("[data-tone]")).toHaveAttribute("data-tone", "success");
    expect(screen.getByRole("link", { name: "Open job" })).toHaveAttribute("href", `/partner-portal/${NORTHCAST_ID}/jobs/${RING_OFFER_ID}`);
    const line = won.closest<HTMLElement>("[role=status]")!;
    await waitFor(() => expect(line).toHaveFocus());
  });

  it("keeps focus on Accept when the answer fails", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs/:groupId/accept`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Error", status: 500, detail: "Something went wrong" },
          { status: 500, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderActions();
    const dialog = await openAccept();
    await userEvent.click(within(dialog).getByRole("button", { name: "Accept job" }));

    const message = await screen.findByText("Something went wrong");
    expect(message.closest("[data-tone]")).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toHaveFocus());
  });

  it("says when the offer is no longer open, plainly", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/partner-portal/partners/:partnerId/jobs/:groupId/accept`, () => {
        fakeState().partnerJobs.answer(NORTHCAST_ID, RING_OFFER_ID, "decline", null);
        return HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "The offer is no longer open" },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        );
      }),
    );
    renderActions();
    const dialog = await openAccept();
    await userEvent.click(within(dialog).getByRole("button", { name: "Accept job" }));

    const message = await screen.findByText("This offer is no longer open.");
    expect(message.closest("[data-tone]")).toBeNull();
  });
});
