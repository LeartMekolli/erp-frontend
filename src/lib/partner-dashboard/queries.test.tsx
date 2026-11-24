import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FAKE_API_URL, LAYERLINE_ID, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER_TWO_SHOPS } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { partnerDashboardKeys, usePartnerCapacity, usePartnerScore, usePartnerSummary } from "./queries";

const FIRST = { from: "2026-10-26", to: "2026-11-24" };
const SECOND = { from: "2026-11-18", to: "2026-11-24" };

afterEach(() => server.events.removeAllListeners());

describe("partner dashboard queries", () => {
  it("keeps the previous range on screen while a new one loads", async () => {
    let range = FIRST;
    const { result, rerender } = renderHookAs(NORTHCAST_MEMBER, () => usePartnerSummary(NORTHCAST_ID, range));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.range).toMatchObject(FIRST);
    expect(result.current.isPlaceholderData).toBe(false);

    range = SECOND;
    rerender();

    expect(result.current.data?.range).toMatchObject(FIRST);
    expect(result.current.isPlaceholderData).toBe(true);
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.range).toMatchObject(SECOND);
  });

  it("never keeps one workshop's range on another's page", async () => {
    let partnerId = NORTHCAST_ID;
    const summary = renderHookAs(PARTNER_TWO_SHOPS, () => usePartnerSummary(partnerId, FIRST));
    await waitFor(() => expect(summary.result.current.data?.jobs_finished).toBe(14));
    const capacity = renderHookAs(PARTNER_TWO_SHOPS, () => usePartnerCapacity(partnerId, FIRST), summary.client);
    await waitFor(() => expect(capacity.result.current.isSuccess).toBe(true));

    partnerId = LAYERLINE_ID;
    summary.rerender();
    capacity.rerender();

    expect(summary.result.current.data).toBeUndefined();
    expect(capacity.result.current.data).toBeUndefined();
    await waitFor(() => expect(summary.result.current.data?.jobs_finished).toBe(2));
    await waitFor(() => expect(capacity.result.current.data?.[0]?.step_type.key).toBe("print"));
  });

  it("asks for the capacity history of the range", async () => {
    const urls: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/capacity-history")) urls.push(request.url);
    });
    const { result } = renderHookAs(NORTHCAST_MEMBER, () => usePartnerCapacity(NORTHCAST_ID, SECOND));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls).toEqual([`${FAKE_API_URL}/partner-portal/partners/${NORTHCAST_ID}/capacity-history?from=2026-11-18&to=2026-11-24`]);
    expect(result.current.data?.[0]).toMatchObject({ date: "2026-11-18", step_type: { key: "print_pattern" } });
  });

  it("keeps each workshop's numbers under its own key", async () => {
    let partnerId = NORTHCAST_ID;
    const { result, rerender, client } = renderHookAs(PARTNER_TWO_SHOPS, () => usePartnerScore(partnerId));
    await waitFor(() => expect(result.current.data?.score.overall).toBe(4.4));

    partnerId = LAYERLINE_ID;
    rerender();

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.score.overall).toBeNull());
    expect(client.getQueryData(partnerDashboardKeys.score(NORTHCAST_ID))).toMatchObject({ score: { overall: 4.4 } });
    expect(partnerDashboardKeys.summary(NORTHCAST_ID, FIRST.from, FIRST.to).slice(0, 2)).toEqual(["partner-dashboard", NORTHCAST_ID]);
  });
});
