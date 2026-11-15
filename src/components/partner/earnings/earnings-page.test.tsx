import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

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
    <PartnerNoticeProvider>
      <EarningsPage />
    </PartnerNoticeProvider>,
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
