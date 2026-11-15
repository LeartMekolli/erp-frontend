import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { usePartnerOwed, usePartnerPayouts, usePayoutAccount, usePayoutLink } from "./queries";

const SECOND = 1_000;

/**
 * TanStack Query polls on setInterval, so the tests move it by hand. setTimeout stays real, so the fetches
 * run; Testing Library's `waitFor` re-checks on setInterval, so these tests wait with `until` instead.
 */
function fakeIntervals() {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  resetFakeState();
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/** Re-checks `check` on real setTimeout until it passes, for up to a second. */
async function until(check: () => void): Promise<void> {
  for (let tries = 0; ; tries += 1) {
    try {
      check();
      return;
    } catch (error) {
      if (tries >= 100) throw error;
      await act(tick);
    }
  }
}

/** Lets any fetch a timer started finish, so a count read afterwards is final. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

/** Counts the GETs to one of the workshop's routes. */
function countGets(path: string): { count: number } {
  const seen = { count: 0 };
  server.events.on("request:start", ({ request }) => {
    if (request.method === "GET" && request.url.startsWith(`${FAKE_API_URL}/partner-portal/partners/${NORTHCAST_ID}${path}`)) seen.count += 1;
  });
  return seen;
}

beforeEach(() => resetFakeState());

afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
});

describe("partner earnings queries", () => {
  it("reads the totals from the first page", async () => {
    const { result } = renderHookAs(PARTNER, () => usePartnerOwed(NORTHCAST_ID, { enabled: true, poll: false }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.totals).toEqual({ due_total: "1240.00", not_yet_total: "380.00", not_yet_count: 3, currency: "EUR" });

    await act(() => result.current.fetchNextPage());

    expect(result.current.items).toHaveLength(25);
    expect(result.current.totals?.due_total).toBe("1240.00");
  });

  it("polls payouts while one is on its way", async () => {
    fakeIntervals();
    const { result } = renderHookAs(PARTNER, () => usePartnerPayouts(NORTHCAST_ID, true));
    await until(() => expect(result.current.items[0]?.status).toBe("pending"));
    expect(result.current.anyPending).toBe(true);

    fakeState().earnings.settlePending(NORTHCAST_ID, "paid");
    act(() => vi.advanceTimersByTime(15 * SECOND));

    await until(() => expect(result.current.items[0]?.status).toBe("paid"));
    expect(result.current.anyPending).toBe(false);
  });

  it("doesn't poll what's owed unless asked", async () => {
    fakeIntervals();
    const gets = countGets("/owed");
    const { result } = renderHookAs(PARTNER, () => usePartnerOwed(NORTHCAST_ID, { enabled: true, poll: false }));
    await until(() => expect(result.current.isSuccess).toBe(true));

    act(() => vi.advanceTimersByTime(30 * SECOND));
    await settle();

    expect(gets.count).toBe(1);
  });

  it("polls what's owed when asked", async () => {
    fakeIntervals();
    const { result } = renderHookAs(PARTNER, () => usePartnerOwed(NORTHCAST_ID, { enabled: true, poll: true }));
    await until(() => expect(result.current.isSuccess).toBe(true));

    fakeState().earnings.settlePending(NORTHCAST_ID, "failed");
    act(() => vi.advanceTimersByTime(15 * SECOND));

    await until(() => expect(result.current.totals?.due_total).toBe("1660.00"));
  });

  it("stops checking once the account is ready", async () => {
    fakeIntervals();
    fakeState().earnings.setAccount(NORTHCAST_ID, "onboarding");
    const gets = countGets("/payout-account");
    const { result } = renderHookAs(PARTNER, () => usePayoutAccount(NORTHCAST_ID, { enabled: true, checking: true }));
    await until(() => expect(result.current.data?.state).toBe("onboarding"));

    fakeState().earnings.setAccount(NORTHCAST_ID, "ready");
    act(() => vi.advanceTimersByTime(5 * SECOND));
    await until(() => expect(result.current.data?.state).toBe("ready"));
    const after = gets.count;

    act(() => vi.advanceTimersByTime(5 * SECOND));
    await settle();
    expect(gets.count).toBe(after);
  });

  it("doesn't check the account unless asked", async () => {
    fakeIntervals();
    const gets = countGets("/payout-account");
    const { result } = renderHookAs(PARTNER, () => usePayoutAccount(NORTHCAST_ID, { enabled: true, checking: false }));
    await until(() => expect(result.current.data?.state).toBe("not_connected"));

    act(() => vi.advanceTimersByTime(20 * SECOND));
    await settle();

    expect(gets.count).toBe(1);
  });

  it("asks for the payout account link", async () => {
    const { result } = renderHookAs(PARTNER, () => usePayoutLink(NORTHCAST_ID));

    const url = await act(() => result.current.mutateAsync());

    expect(url).toBe(`${FAKE_API_URL}/fake-provider/onboarding?partner=${NORTHCAST_ID}`);
  });
});
