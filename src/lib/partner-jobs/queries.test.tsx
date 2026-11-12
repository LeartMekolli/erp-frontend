import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RING_OFFER_ID, PENDANT_OFFER_ID } from "../../../test/fake-erp-api/partner-jobs";
import { NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { partnerJobsKeys, useAnswerOffer, usePartnerJobs } from "./queries";

afterEach(() => server.events.removeAllListeners());

describe("partner job queries", () => {
  it("lists a workshop's offers", async () => {
    const { result } = renderHookAs(PARTNER, () => usePartnerJobs(NORTHCAST_ID, "offered"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.items.map((job) => job.id).toSorted()).toEqual([RING_OFFER_ID, PENDANT_OFFER_ID].toSorted());
  });

  it("accepts with a retry key", async () => {
    const keys: (string | null)[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.endsWith(`/jobs/${RING_OFFER_ID}/accept`)) keys.push(request.headers.get("idempotency-key"));
    });
    const { result, client } = renderHookAs(PARTNER, () => ({
      offers: usePartnerJobs(NORTHCAST_ID, "offered"),
      answer: useAnswerOffer(NORTHCAST_ID),
    }));
    await waitFor(() => expect(result.current.offers.items).toHaveLength(2));

    await act(() => result.current.answer.mutateAsync({ groupId: RING_OFFER_ID, answer: "accept" }));

    expect(keys).toHaveLength(1);
    expect(keys[0]).toBeTruthy();
    await waitFor(() => expect(result.current.offers.items.map((job) => job.id)).toEqual([PENDANT_OFFER_ID]));
    expect(client.getQueryState(partnerJobsKeys.list(NORTHCAST_ID, "offered"))?.isInvalidated).toBe(false);
  });
});
