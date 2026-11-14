import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RING_BAND_JOB_ID, RING_OFFER_ID, PENDANT_OFFER_ID } from "../../../test/fake-erp-api/partner-jobs";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { partnerJobsKeys, useAnswerOffer, usePartnerJob, usePartnerJobs, usePartnerMovePieces } from "./queries";

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

  it("moves through the partner's route", async () => {
    const sent: { url: string; key: string | null }[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") sent.push({ url: request.url, key: request.headers.get("idempotency-key") });
    });
    const { result } = renderHookAs(PARTNER, () => ({ job: usePartnerJob(NORTHCAST_ID, RING_BAND_JOB_ID), move: usePartnerMovePieces(NORTHCAST_ID) }));
    await waitFor(() => expect(result.current.job.data).toBeDefined());
    const piece = result.current.job.data!.work_orders.filter((one) => one.step_key === "finish")[1]!;

    await act(() =>
      result.current.move.mutateAsync({
        kind: "pass",
        work_order_ids: [piece.id],
        at_step: "finish",
        answers: [{ item: "surface_smooth", value: true }],
        photo_file_version_ids: ["f1f1f1f1-0000-4000-8000-000000000001"],
      }),
    );

    expect(sent).toEqual([{ url: `${FAKE_API_URL}/partner-portal/partners/${NORTHCAST_ID}/moves`, key: expect.any(String) }]);
    await waitFor(() => expect(result.current.job.data!.work_orders.find((one) => one.id === piece.id)?.step_key).toBe("final_qc"));
  });
});
