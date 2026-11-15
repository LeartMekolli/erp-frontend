import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PartnerRole, PayoutAccountState } from "@/lib/api/schema-types";

import { FAKE_API_URL, NORTHCAST_ADMIN, NORTHCAST_ID, PARTNER, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";
import { settle, until } from "../../../../test/wait";

import { PartnerNoticeLine, PartnerNoticeProvider } from "../notice";

import { PayoutAccountPanel } from "./payout-account-panel";

const SECOND = 1_000;
const LINK_URL = `${FAKE_API_URL}/fake-provider/onboarding?partner=${NORTHCAST_ID}`;

let go = vi.fn<(url: string) => void>();
let accountGets = 0;
let linkPosts = 0;

beforeEach(() => {
  go = vi.fn();
  accountGets = 0;
  linkPosts = 0;
  server.events.on("request:start", ({ request }) => {
    if (!request.url.startsWith(`${FAKE_API_URL}/partner-portal/partners/${NORTHCAST_ID}/payout-account`)) return;
    if (request.method === "POST") linkPosts += 1;
    else accountGets += 1;
  });
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
});

function renderPanel(
  user: FakeUser,
  { role = "owner", suspended = false, onboarding = null }: { role?: PartnerRole; suspended?: boolean; onboarding?: "done" | "expired" | null } = {},
) {
  return renderAs(
    user,
    <PartnerNoticeProvider>
      <PartnerNoticeLine />
      <PayoutAccountPanel partnerId={NORTHCAST_ID} role={role} suspended={suspended} onboarding={onboarding} go={go} />
    </PartnerNoticeProvider>,
  );
}

describe("PayoutAccountPanel", () => {
  it.each<[PayoutAccountState, string, string]>([
    ["not_connected", "Set up payouts so the workspace can pay you.", "Set up payouts"],
    ["onboarding", "Your payout setup isn't finished, so the workspace can't pay you yet.", "Finish setup"],
    ["restricted", "The payment provider needs more details before you can be paid.", "Update details"],
  ])("words the %s account", async (state, words, button) => {
    fakeState().earnings.setAccount(NORTHCAST_ID, state);
    renderPanel(PARTNER);

    expect(await screen.findByText(words)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
    expect(screen.queryByText("Your workshop's owner can do this.")).not.toBeInTheDocument();
  });

  it("shows nothing for a ready account", async () => {
    fakeState().earnings.setAccount(NORTHCAST_ID, "ready");
    renderPanel(PARTNER);

    await until(() => expect(accountGets).toBe(1));
    await settle();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/payout/i)).not.toBeInTheDocument();
  });

  it("tells an admin the owner can do it", async () => {
    renderPanel(NORTHCAST_ADMIN, { role: "admin" });

    expect(await screen.findByText("Set up payouts so the workspace can pay you.")).toBeInTheDocument();
    expect(screen.getByText("Your workshop's owner can do this.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("asks for one link", async () => {
    const user = userEvent.setup();
    renderPanel(PARTNER);
    const button = await screen.findByRole("button", { name: "Set up payouts" });

    await user.dblClick(button);

    await until(() => expect(go).toHaveBeenCalledWith(LINK_URL));
    await settle();
    expect(go).toHaveBeenCalledTimes(1);
    expect(linkPosts).toBe(1);
  });

  it("hides setup while suspended", async () => {
    renderPanel(PARTNER, { suspended: true });

    expect(await screen.findByText("Set up payouts so the workspace can pay you.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says when the workspace can't take payments", async () => {
    fakeState().earnings.linkUnavailable(NORTHCAST_ID);
    const user = userEvent.setup();
    renderPanel(PARTNER);

    await user.click(await screen.findByRole("button", { name: "Set up payouts" }));

    expect(await screen.findByText("The workspace hasn't set up payments yet. Ask them to.")).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });

  it("offers a new link when the last ran out", async () => {
    fakeState().earnings.setAccount(NORTHCAST_ID, "onboarding");
    renderPanel(PARTNER, { onboarding: "expired" });

    expect(await screen.findByText("That setup link ran out.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get a new link" })).toBeInTheDocument();
  });

  describe("after setup", () => {
    // The check runs on TanStack Query's setInterval and ends a minute after the page opens, by Date.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: Date.parse("2026-11-15T10:00:00Z") });
      resetFakeState();
      fakeState().earnings.setAccount(NORTHCAST_ID, "onboarding");
    });

    it("checks the account after setup", async () => {
      renderPanel(PARTNER, { onboarding: "done" });
      expect(await screen.findByText("Checking your payout account…")).toBeInTheDocument();

      fakeState().earnings.setAccount(NORTHCAST_ID, "ready");
      act(() => vi.advanceTimersByTime(5 * SECOND));

      await until(() => expect(screen.getByText("Payouts are set up.")).toBeInTheDocument());
      expect(screen.queryByText("Checking your payout account…")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("stops checking after a minute", async () => {
      renderPanel(PARTNER, { onboarding: "done" });
      expect(await screen.findByText("Checking your payout account…")).toBeInTheDocument();

      for (let n = 0; n < 12; n += 1) {
        act(() => vi.advanceTimersByTime(5 * SECOND));
        await settle();
      }

      await until(() => expect(screen.getByText("Your payout setup isn't finished, so the workspace can't pay you yet.")).toBeInTheDocument());
      expect(screen.queryByText("Checking your payout account…")).not.toBeInTheDocument();
      const after = accountGets;
      act(() => vi.advanceTimersByTime(15 * SECOND));
      await settle();
      expect(accountGets).toBe(after);
    });
  });
});
