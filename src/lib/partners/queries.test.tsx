import { act, waitFor } from "@testing-library/react";
import { http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, NORTHCAST_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";
import { until } from "../../../test/wait";

import { payRefusal, usePartners, usePayPartner, useStaffPartnerPayouts } from "./queries";

beforeEach(() => resetFakeState());

afterEach(() => {
  vi.useRealTimers();
});

/** The error a rejected pay carries. */
async function refusalOf(pay: () => Promise<unknown>): Promise<unknown> {
  try {
    await pay();
  } catch (error) {
    return error;
  }
  throw new Error("the pay was not refused");
}

describe("staff partner queries", () => {
  it("pages the partners list", async () => {
    const { result } = renderHookAs(STAFF, () => usePartners());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("puts a new payout first", async () => {
    fakeState().earnings.setAccount(NORTHCAST_ID, "ready");
    fakeState().earnings.settlePending(NORTHCAST_ID, "paid");
    const { result } = renderHookAs(STAFF, () => ({
      payouts: useStaffPartnerPayouts(NORTHCAST_ID, true),
      pay: usePayPartner(NORTHCAST_ID),
    }));
    await waitFor(() => expect(result.current.payouts.isSuccess).toBe(true));
    const before = result.current.payouts.items.length;
    // The re-read after the pay never answers, so only the put into the cache can show the new payout.
    server.use(http.get(`${FAKE_API_URL}/partners/:id/payouts`, () => new Promise<never>(() => {})));

    let paid: { id: string; status: string } | undefined;
    await act(async () => {
      paid = await result.current.pay.mutateAsync();
    });

    expect(paid?.status).toBe("pending");
    expect(result.current.payouts.items).toHaveLength(before + 1);
    expect(result.current.payouts.items[0]).toMatchObject({ id: paid?.id, status: "pending" });
  });

  it("reads a pay refusal's code", async () => {
    const { result } = renderHookAs(STAFF, () => usePayPartner(NORTHCAST_ID));

    const notReady = await refusalOf(() => act(() => result.current.mutateAsync()));
    expect(payRefusal(notReady)).toBe("payout_account_not_ready");

    fakeState().earnings.setAccount(NORTHCAST_ID, "ready");
    fakeState().earnings.settlePending(NORTHCAST_ID, "paid");
    await act(() => result.current.mutateAsync());
    const nothingDue = await refusalOf(() => act(() => result.current.mutateAsync()));
    expect(payRefusal(nothingDue)).toBe("nothing_due");

    expect(payRefusal({ type: "about:blank", title: "Conflict", status: 409 })).toBe("other");
    expect(payRefusal({ type: "about:blank", title: "Server error", status: 500 })).toBeUndefined();
    expect(payRefusal(new Error("offline"))).toBeUndefined();
  });

  it("polls while a payout is on its way", async () => {
    // TanStack Query polls on setInterval, so the test moves it by hand; setTimeout stays real, so the fetches run.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { result } = renderHookAs(STAFF, () => useStaffPartnerPayouts(NORTHCAST_ID, true));
    await until(() => expect(result.current.items[0]?.status).toBe("pending"));
    expect(result.current.anyPending).toBe(true);

    fakeState().earnings.settlePending(NORTHCAST_ID, "failed");
    act(() => vi.advanceTimersByTime(15_000));

    await until(() => expect(result.current.anyPending).toBe(false));
    expect(result.current.items[0]?.status).toBe("failed");
  });
});
