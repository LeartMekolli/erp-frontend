import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { CAST_RING_ID, NAMEPLATE_ID } from "../../../test/fake-erp-api/catalog";
import { FAKE_API_URL, LUNA_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { useGetQuote, usePlaceOrder } from "./mutations";

describe("new order mutations", () => {
  it("resolves a refused quote", async () => {
    const { result } = renderHookAs(STAFF, () => useGetQuote());
    // A Cast ring is made from the customer's model, and none is given.
    const answer = await result.current.mutateAsync({ customer_id: LUNA_ID, product_id: CAST_RING_ID, options: {}, quantity: 1 });
    expect(answer.accepted).toBe(false);
    if (!answer.accepted) expect(answer.reasons.map((reason) => reason.code)).toEqual(["file_required"]);
  });

  it("sends the same key when Place is retried", async () => {
    const { result } = renderHookAs(STAFF, () => ({ quote: useGetQuote(), place: usePlaceOrder() }));
    const quoted = await result.current.quote.mutateAsync({ customer_id: LUNA_ID, product_id: NAMEPLATE_ID, options: {}, quantity: 1 });
    if (!quoted.accepted) throw new Error("the quote was refused");

    const keys: (string | null)[] = [];
    server.use(
      http.post(`${FAKE_API_URL}/orders`, ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key"));
        return keys.length === 1 ? HttpResponse.error() : undefined;
      }),
    );
    const body = { customer_id: LUNA_ID, lines: [{ quote_id: quoted.quote.id }], shipping_method: "courier" };
    await expect(result.current.place.mutateAsync(body)).rejects.toBeDefined();
    await waitFor(() => expect(result.current.place.isError).toBe(true));
    const placed = await result.current.place.mutateAsync(body);

    expect(placed.id).toBeTruthy();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });
});
