import { describe, expect, it } from "vitest";

import type {
  Order,
  PlaceOrderBody,
  PlacedOrder,
  PriceChangedProblem,
  QuoteBody,
  QuoteResult,
  QuoteSummary,
  ShippingRate,
} from "../../src/lib/api/schema-types";
import { addMoney } from "../../src/lib/format/money";

import { CAST_RING_ID, NAMEPLATE_ID } from "./catalog";
import { FAKE_API_URL, FAKE_PASSWORD, LUNA_ID, MIRA_ID, ORDER_TAKER, WORKSPACE } from "./seed";
import { fakeState } from "./state";

async function signIn(): Promise<string> {
  const login = await fetch(`${FAKE_API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: WORKSPACE, email: ORDER_TAKER.email, password: FAKE_PASSWORD }),
  });
  return ((await login.json()) as { access_token: string }).access_token;
}

async function post(token: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${FAKE_API_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A model the customer uploaded, its bytes in storage and, unless `measured` is false, measured. Its version id. */
function customerModel(customerId: string, measured = true): string {
  const state = fakeState();
  const { file, version } = state.startFile(
    { kind: "design", name: "ring.stl", content_type: "model/stl", size: 3, declared_unit: "mm", customer_id: customerId },
    { origin: FAKE_API_URL },
  );
  state.storeObject(file.id, version.id, { contentType: "model/stl", size: 3 });
  state.completeFile(file.id, version.id);
  // Each read moves it one step: uploaded, measuring, measured.
  if (measured) for (let read = 0; read < 2; read += 1) state.getFile(file.id);
  return version.id;
}

/** A saved quote for one Nameplate in Standard resin: 6.00 + 5.00 + 2.00. */
async function nameplateQuote(token: string, customerId = LUNA_ID): Promise<QuoteSummary> {
  const body: QuoteBody = { customer_id: customerId, product_id: NAMEPLATE_ID, options: { print_material: "resin_standard" }, quantity: 1 };
  const res = await post(token, "/pricing/quotes", body);
  expect(res.status).toBe(201);
  const result = (await res.json()) as QuoteResult;
  if (!result.accepted) throw new Error("Nameplate should be priced");
  return result.quote;
}

const placeBody = (quoteId: string, extra: Partial<PlaceOrderBody> = {}): PlaceOrderBody => ({
  customer_id: LUNA_ID,
  lines: [{ quote_id: quoteId }],
  shipping_method: "courier",
  ...extra,
});

describe("fake erp-api quotes, shipping rates and placing", () => {
  it("prices Cast ring for Luna with a measured file", async () => {
    const token = await signIn();
    const res = await post(token, "/pricing/quotes", {
      customer_id: LUNA_ID,
      product_id: CAST_RING_ID,
      options: { metal: "silver_925", finish: "polished" },
      file_version_id: customerModel(LUNA_ID),
      quantity: 2,
    } satisfies QuoteBody);
    expect(res.status).toBe(201);
    const result = (await res.json()) as QuoteResult;
    if (!result.accepted) throw new Error("Cast ring should be priced");
    const { quote } = result;
    expect(quote.lines.map((line) => line.label)).toEqual(["material", "making", "finishing"]);
    expect(quote.lines.reduce((sum, line) => addMoney(sum, line.amount), "0.00")).toBe(quote.unit_price);
    expect(quote.unit_price).toBe("75.00");
    expect(quote.total).toBe("150.00");
    expect(quote.currency).toBe("EUR");
    expect(quote.expired).toBe(false);
  });

  it("refuses Cast ring with no file", async () => {
    const token = await signIn();
    const res = await post(token, "/pricing/quotes", {
      customer_id: LUNA_ID,
      product_id: CAST_RING_ID,
      options: { metal: "silver_925" },
      quantity: 1,
    } satisfies QuoteBody);
    expect(res.status).toBe(200);
    const result = (await res.json()) as QuoteResult;
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasons.map((reason) => reason.code)).toEqual(["file_required"]);
  });

  it("refuses a model that isn't measured yet", async () => {
    const token = await signIn();
    const res = await post(token, "/pricing/quotes", {
      customer_id: LUNA_ID,
      product_id: CAST_RING_ID,
      options: { metal: "silver_925" },
      file_version_id: customerModel(LUNA_ID, false),
      quantity: 1,
    } satisfies QuoteBody);
    expect(res.status).toBe(200);
    const result = (await res.json()) as QuoteResult;
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.reasons.map((reason) => reason.code)).toEqual(["file_not_measured"]);
  });

  it("404s another customer's file", async () => {
    const token = await signIn();
    const res = await post(token, "/pricing/quotes", {
      customer_id: LUNA_ID,
      product_id: CAST_RING_ID,
      file_version_id: customerModel(MIRA_ID),
      quantity: 1,
    } satisfies QuoteBody);
    expect(res.status).toBe(404);
  });

  it("places a quote once", async () => {
    const token = await signIn();
    const quote = await nameplateQuote(token);
    expect((await post(token, "/orders", placeBody(quote.id))).status).toBe(201);

    const again = await post(token, "/orders", placeBody(quote.id));
    expect(again.status).toBe(409);
    const problem = (await again.json()) as { code?: string; errors: { path: string }[] };
    expect(problem.code).toBeUndefined();
    expect(problem.errors.map((error) => error.path)).toEqual(["lines.0"]);
  });

  it("answers price_changed after the hold", async () => {
    const token = await signIn();
    const quote = await nameplateQuote(token);
    expect(quote.total).toBe("13.00");
    fakeState().quotes.expireQuotes();

    const res = await post(token, "/orders", placeBody(quote.id));
    expect(res.status).toBe(409);
    const problem = (await res.json()) as PriceChangedProblem;
    expect(problem).toMatchObject({ title: "Conflict", status: 409, code: "price_changed" });
    expect(problem.lines).toHaveLength(1);
    const [line] = problem.lines;
    expect(line).toMatchObject({ position: 0, previous_quote_id: quote.id, reasons: [] });
    expect(line!.quote?.id).not.toBe(quote.id);
    expect(line!.quote?.total).toBe("14.30");
    expect(line!.quote?.expired).toBe(false);

    const placed = await post(token, "/orders", placeBody(line!.quote!.id));
    expect(placed.status).toBe(201);
    expect(((await placed.json()) as PlacedOrder).lines[0]!.total).toBe("14.30");
  });

  it("places a pay_first order awaiting payment", async () => {
    const token = await signIn();
    const quote = await nameplateQuote(token);
    const res = await post(token, "/orders", placeBody(quote.id, { note: "Gift wrap, please" }));
    expect(res.status).toBe(201);
    const order = (await res.json()) as PlacedOrder;
    expect(order).toMatchObject({
      customer: { id: LUNA_ID, name: "Luna Jewels" },
      state: "awaiting_payment",
      delivery_speed: "standard",
      address: { city: "Lyon", country: "FR" },
      shipping: { method: { key: "courier", name: "Courier" }, price: "12.00" },
      lines_total: "13.00",
      total: "25.00",
      note: "Gift wrap, please",
      placed_by: { id: ORDER_TAKER.id, name: ORDER_TAKER.name },
      payment: { terms: "pay_first", state: "awaiting_payment", paid: "0.00" },
    });
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]).toMatchObject({ position: 0, product: { id: NAMEPLATE_ID, name: "Nameplate" }, quantity: 1, total: "13.00" });
    expect(order.needs).toContain("to_collect");

    const opened = await fetch(`${FAKE_API_URL}/orders/${order.id}`, { headers: { authorization: `Bearer ${token}` } });
    expect(opened.status).toBe(200);
    expect(((await opened.json()) as Order).number).toBe(order.number);
  });

  it("places a pay_later order for Mira in production, to the address given", async () => {
    const token = await signIn();
    const quote = await nameplateQuote(token, MIRA_ID);
    const address = { name: "Mira Studio", line1: "4 Canal Street", city: "Ghent", postal_code: "9000", country: "BE" };
    const noAddress = await post(token, "/orders", placeBody(quote.id, { customer_id: MIRA_ID }));
    expect(noAddress.status).toBe(400);

    const res = await post(token, "/orders", placeBody(quote.id, { customer_id: MIRA_ID, address }));
    expect(res.status).toBe(201);
    const order = (await res.json()) as PlacedOrder;
    expect(order).toMatchObject({ state: "in_production", address, payment: { terms: "pay_later" } });
  });

  it("rates the shipping methods for a customer", async () => {
    const token = await signIn();
    const res = await post(token, "/orders/shipping-rates", { customer_id: LUNA_ID });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: ShippingRate[] };
    expect(data).toEqual([
      { key: "courier", name: "Courier", price: "12.00", available: true, reason: null },
      { key: "collect", name: "Collect", price: "0.00", available: true, reason: null },
      { key: "express_courier", name: "Express courier", price: null, available: false, reason: "No courier account is set up" },
    ]);
  });
});
