import { act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { QuoteBody, QuoteSummary } from "@/lib/api/schema-types";
import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";
import { useCustomerProducts, useDeliverySpeeds } from "@/lib/new-order/queries";

import { CAST_RING_ID, GIFT_SET_ID } from "../../../test/fake-erp-api/catalog";
import { FAKE_API_URL, LUNA_ID, MIRA_ID, ORDER_TAKER } from "../../../test/fake-erp-api/seed";
import { server } from "../../../test/msw";
import { renderHookAs } from "../../../test/render";

import { refusalsByField, usePrice, useQuoteBody } from "./use-price";

const GIFT_SET: QuoteBody = { customer_id: LUNA_ID, product_id: GIFT_SET_ID, options: {}, quantity: 1, delivery_speed: "standard" };

/** A price erp-api answered at placing, after the first one's hold ran out. */
const REPRICED: QuoteSummary = {
  id: "quote-repriced",
  product: { id: GIFT_SET_ID, name: "Gift set" },
  quantity: 1,
  currency: "EUR",
  lines: [{ label: "making", amount: "26.40" }],
  unit_price: "26.40",
  total: "26.40",
  expires_at: "2026-11-18T10:00:00.000Z",
  expired: false,
};

/** Renders `usePrice` on whatever `body` holds; change it, then `rerender()`. */
function renderPrice(first: QuoteBody | null) {
  let body = first;
  const rendered = renderHookAs(ORDER_TAKER, () => usePrice(body));
  return {
    ...rendered,
    setBody(next: QuoteBody | null) {
      body = next;
      rendered.rerender();
    },
  };
}

describe("usePrice", () => {
  it("shows a price only while its body is the current one", async () => {
    const { result, setBody } = renderPrice(GIFT_SET);
    expect(result.current.ready).toBe(true);
    act(() => result.current.getPrice());
    await waitFor(() => expect(result.current.shown).not.toBeNull());
    const quote = result.current.shown!.quote;
    expect(quote.total).toBe("24.00");
    expect(result.current.shown!.changed).toBe(false);

    setBody({ ...GIFT_SET, quantity: 2 });
    expect(result.current.shown).toBeNull();
    setBody(null);
    expect(result.current.shown).toBeNull();
    expect(result.current.ready).toBe(false);

    // The same configuration on screen again is the same quote again.
    setBody({ delivery_speed: "standard", quantity: 1, options: {}, product_id: GIFT_SET_ID, customer_id: LUNA_ID });
    expect(result.current.shown?.quote.id).toBe(quote.id);
  });

  it("keeps refusals to their body too, each under its field", async () => {
    // A Cast ring is made from the customer's model, and none is given.
    const ring: QuoteBody = { customer_id: LUNA_ID, product_id: CAST_RING_ID, options: {}, size: { scale: "1" }, quantity: 1 };
    const { result, setBody } = renderPrice(ring);
    act(() => result.current.getPrice());
    await waitFor(() => expect(result.current.refusals).toHaveLength(1));
    expect(result.current.refusals[0]!.code).toBe("file_required");
    expect(result.current.refusedFields).toEqual(new Set(["model"]));
    expect(result.current.fieldRefusals.get("model")).toEqual(["Cast ring is made from the customer's model: upload it first"]);
    expect(result.current.shown).toBeNull();

    setBody({ ...ring, quantity: 2 });
    expect(result.current.refusals).toEqual([]);
    expect(result.current.fieldRefusals.size).toBe(0);
  });

  it("keeps a failure to its body and what was asked to price", async () => {
    server.use(http.post(`${FAKE_API_URL}/pricing/quotes`, () => HttpResponse.error()));
    const { result, setBody } = renderPrice(GIFT_SET);
    act(() => result.current.getPrice());
    await waitFor(() => expect(result.current.error).toBe("AMI can't reach the server right now. Try again in a moment."));
    await waitFor(() => expect(result.current.pending).toBe(false));

    setBody({ ...GIFT_SET, quantity: 2 });
    expect(result.current.error).toBeNull();
  });

  it("adopts a changed price for the current body, and clears it", () => {
    const { result, setBody } = renderPrice(GIFT_SET);
    act(() => result.current.adopt(REPRICED));
    expect(result.current.shown).toEqual({ quote: REPRICED, changed: true });

    act(() => result.current.clear());
    expect(result.current.shown).toBeNull();

    act(() => result.current.adoptRefusals([{ code: "price_missing", message: "Gift set has no price yet" }]));
    expect(result.current.refusals.map((reason) => reason.message)).toEqual(["Gift set has no price yet"]);
    expect(result.current.refusedFields.size).toBe(0);

    setBody({ ...GIFT_SET, quantity: 3 });
    expect(result.current.refusals).toEqual([]);
  });
});

describe("refusalsByField", () => {
  it("groups each message under its field and leaves the rest out", () => {
    const byField = refusalsByField([
      { code: "size_out_of_range", message: "The scale must be from 0.5 to 3" },
      { code: "unknown_size", message: "Cast ring takes a scale" },
      { code: "required_missing", message: "Pick a metal" },
      { code: "price_missing", message: "No price yet" },
    ]);
    expect([...byField.entries()]).toEqual([
      ["size", ["The scale must be from 0.5 to 3", "Cast ring takes a scale"]],
      ["options", ["Pick a metal"]],
    ]);
  });
});

describe("useQuoteBody", () => {
  it("waits for the customer's products and delivery speeds", async () => {
    const { result } = renderHookAs(ORDER_TAKER, () => {
      const form = useForm<NewOrderValues>({
        defaultValues: { ...EMPTY_VALUES, customerId: LUNA_ID, productId: GIFT_SET_ID, speed: "standard" },
      });
      return useQuoteBody(form.control, undefined);
    });
    expect(result.current).toBeNull();
    await waitFor(() =>
      expect(result.current).toEqual({ customer_id: LUNA_ID, product_id: GIFT_SET_ID, options: {}, quantity: 1, delivery_speed: "standard" }),
    );
  });

  it("is null for a speed the customer's plan doesn't offer", async () => {
    // Mira's plan offers only Standard; Express is what another customer had picked.
    const { result } = renderHookAs(ORDER_TAKER, () => {
      const form = useForm<NewOrderValues>({
        defaultValues: { ...EMPTY_VALUES, customerId: MIRA_ID, productId: GIFT_SET_ID, speed: "express" },
      });
      return {
        body: useQuoteBody(form.control, undefined),
        products: useCustomerProducts(MIRA_ID).data,
        speeds: useDeliverySpeeds(MIRA_ID).data,
      };
    });
    await waitFor(() => expect(result.current.speeds).toBeDefined());
    await waitFor(() => expect(result.current.products).toBeDefined());
    expect(result.current.products?.some((product) => product.id === GIFT_SET_ID)).toBe(true);
    expect(result.current.body).toBeNull();
  });
});
