import { act, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogProduct, QuoteSummary } from "@/lib/api/schema-types";
import { EMPTY_ADDRESS, EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";

import { CAST_RING_ID, GIFT_SET_ID } from "../../../test/fake-erp-api/catalog";
import { LUNA_ID, MIRA_ID, ORDER_TAKER } from "../../../test/fake-erp-api/seed";
import { renderHookAs } from "../../../test/render";

import type { RefusedField } from "./product-section";
import { useCheckout } from "./use-checkout";
import type { Placing } from "./use-place";
import type { Price } from "./use-price";

/** A price that is only shown, never placed: €122.11. */
const QUOTE: QuoteSummary = {
  id: "a9a9a9a9-0000-4000-8000-000000000002",
  product: { id: GIFT_SET_ID, name: "Gift set" },
  quantity: 1,
  currency: "EUR",
  lines: [{ label: "making", amount: "122.11" }],
  unit_price: "122.11",
  total: "122.11",
  expires_at: "2026-11-18T10:00:00.000Z",
  expired: false,
};

function catalogProduct(overrides: Partial<CatalogProduct>): CatalogProduct {
  return {
    id: GIFT_SET_ID,
    category_id: "44444444-4444-4444-8444-444444444444",
    key: "gift_set",
    name: "Gift set",
    kind: "assembly",
    status: "active",
    material_id: null,
    sizing: { mode: "none" },
    design_file: null,
    options: [],
    published: true,
    customer_id: null,
    parts: [],
    ...overrides,
  };
}

const GIFT_SET = catalogProduct({});
/** Made from the customer's model, in a scale from 0.5 to 3. */
const CAST_RING = catalogProduct({ id: CAST_RING_ID, key: "cast_ring", name: "Cast ring", kind: "custom", sizing: { mode: "range", min: "0.5", max: "3" } });

/** `usePrice` standing still: nothing to price, nothing shown, unless `overrides` say otherwise. */
function fakePrice(overrides: Partial<Price> = {}): Price {
  return {
    ready: false,
    shown: null,
    stale: null,
    refusals: [],
    fieldRefusals: new Map<RefusedField, readonly string[]>(),
    refusedFields: new Set<RefusedField>(),
    getPrice: () => {},
    adopt: () => {},
    adoptRefusals: () => {},
    clear: () => {},
    pending: false,
    error: null,
    ...overrides,
  };
}

const priced = (quote: QuoteSummary) => fakePrice({ ready: true, shown: { quote, changed: false } });

function idlePlacing(place: Placing["place"] = () => {}): Placing {
  return { place, pending: false, failure: null };
}

const NO_MODEL = { held: false, ready: false };

interface Args {
  price: Price;
  placing: Placing;
  model: { held: boolean; ready: boolean };
  product: CatalogProduct | undefined;
}

/** Runs `useCheckout` on a form starting from `values`; `update` swaps the other inputs and renders again. */
function renderCheckout(values: Partial<NewOrderValues>, first: Partial<Args> = {}) {
  let args: Args = { price: fakePrice(), placing: idlePlacing(), model: NO_MODEL, product: undefined, ...first };
  const rendered = renderHookAs(ORDER_TAKER, () => {
    const form = useForm<NewOrderValues>({ defaultValues: { ...EMPTY_VALUES, ...values } });
    return { form, checkout: useCheckout({ form, ...args }) };
  });
  return {
    ...rendered,
    update(next: Partial<Args>) {
      args = { ...args, ...next };
      rendered.rerender();
    },
  };
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

afterEach(() => {
  setOnline(true);
});

const MIRA_ADDRESS = { name: "Mira Studio", line1: "3 Canal Street", city: "Leeds", postal_code: "LS1 4AB", country: "GB" };

describe("useCheckout", () => {
  it("main is Get price with the first reason", async () => {
    const getPrice = vi.fn();
    const { result, update } = renderCheckout({}, { price: fakePrice({ getPrice }) });
    const main = () => result.current.checkout.main;
    expect(main()).toMatchObject({ kind: "get-price", label: "Get price", off: true, reason: "Pick the customer first." });
    expect(result.current.checkout.total).toBeNull();
    act(() => main().run());
    expect(getPrice).not.toHaveBeenCalled();

    act(() => result.current.form.setValue("customerId", LUNA_ID));
    expect(main().reason).toBe("Pick a product.");
    // Picking Luna asks for her saved address, then its shipping methods. Both land here, while still online
    // (the query client holds requests while offline), so nothing is left running when the test ends.
    await waitFor(() => expect(result.current.checkout.rateList).toBeDefined());

    act(() => result.current.form.setValue("productId", CAST_RING_ID));
    update({ product: CAST_RING });
    expect(main().reason).toBe("Add the model first.");
    update({ model: { held: true, ready: false } });
    expect(main().reason).toBe("Wait for the model to be measured.");
    update({ model: { held: true, ready: true } });
    expect(main().reason).toBe("Pick a size.");

    // Filled in: nothing to say, and it can be pressed once there is a body to price.
    act(() => result.current.form.setValue("size", "1"));
    expect(main()).toMatchObject({ off: true, reason: null });
    update({ price: fakePrice({ ready: true, getPrice }) });
    expect(main()).toMatchObject({ kind: "get-price", off: false, reason: null });
    act(() => main().run());
    expect(getPrice).toHaveBeenCalledTimes(1);

    // Offline wins.
    act(() => setOnline(false));
    expect(main()).toMatchObject({ off: true, reason: "You're offline." });
    act(() => main().run());
    expect(getPrice).toHaveBeenCalledTimes(1);
  });

  it("main is Get new price when stale", async () => {
    const getPrice = vi.fn();
    const { result, update } = renderCheckout(
      { customerId: LUNA_ID, productId: GIFT_SET_ID },
      { price: fakePrice({ ready: true, stale: QUOTE, getPrice }), product: GIFT_SET },
    );
    expect(result.current.checkout.main).toMatchObject({ kind: "get-new-price", label: "Get new price", off: false, reason: null });
    // The stale price is no total: it isn't the price of what is on screen.
    expect(result.current.checkout.total).toBeNull();
    act(() => result.current.checkout.main.run());
    expect(getPrice).toHaveBeenCalledTimes(1);

    update({ price: fakePrice({ ready: true, stale: QUOTE, getPrice, pending: true }) });
    expect(result.current.checkout.main).toMatchObject({ kind: "get-new-price", label: "Getting a price…", off: true });

    // Luna's saved address and its shipping methods were asked for at once: let both land before the test ends.
    await waitFor(() => expect(result.current.checkout.rateList).toBeDefined());
  });

  it("main is Place order once priced", async () => {
    const place = vi.fn();
    const { result } = renderCheckout({ customerId: LUNA_ID, shippingMethod: "courier" }, { price: priced(QUOTE), placing: idlePlacing(place) });
    await waitFor(() => expect(result.current.checkout.main.off).toBe(false));
    expect(result.current.checkout.main).toMatchObject({ kind: "place", label: "Place order", reason: null });

    act(() => result.current.checkout.main.run());
    // The saved address is erp-api's own, so only the method and the note can take its field errors.
    expect(place).toHaveBeenCalledWith({ customer_id: LUNA_ID, lines: [{ quote_id: QUOTE.id }], shipping_method: "courier" }, ["shippingMethod", "note"]);
  });

  it("total is before shipping until a method is picked", async () => {
    const { result } = renderCheckout({ customerId: LUNA_ID }, { price: priced(QUOTE) });
    expect(result.current.checkout.total).toEqual({ label: "Before shipping and tax", amount: "€122.11" });
    // Listed, none picked: still before shipping.
    await waitFor(() => expect(result.current.checkout.rateList).toBeDefined());
    expect(result.current.checkout.rate).toBeUndefined();
    expect(result.current.checkout.total).toEqual({ label: "Before shipping and tax", amount: "€122.11" });
  });

  it("total adds the shipping", async () => {
    const { result } = renderCheckout({ customerId: LUNA_ID, shippingMethod: "courier" }, { price: priced(QUOTE) });
    await waitFor(() => expect(result.current.checkout.total).toEqual({ label: "Total before tax", amount: "€134.11" }));

    act(() => result.current.form.setValue("shippingMethod", "collect"));
    expect(result.current.checkout.total).toEqual({ label: "Total before tax", amount: "€122.11" });
  });

  it("Place says why it is off", async () => {
    const { result } = renderCheckout({ customerId: MIRA_ID }, { price: priced(QUOTE) });
    const main = () => result.current.checkout.main;

    // Mira has no saved address, and none is typed yet.
    await waitFor(() => expect(main().reason).toBe("Fill in the address first."));
    expect(main()).toMatchObject({ kind: "place", off: true });

    // A complete address: while its methods are waited for, nothing is said.
    act(() => result.current.checkout.setAddress({ ...EMPTY_ADDRESS, ...MIRA_ADDRESS }));
    expect(result.current.checkout.waiting).toBe(true);
    expect(main()).toMatchObject({ off: true, reason: null });

    // Listed, none picked.
    await waitFor(() => expect(main().reason).toBe("Pick a shipping method."));
    expect(main().off).toBe(true);

    // Offline wins, and the other reason comes back with the connection.
    act(() => setOnline(false));
    expect(main().reason).toBe("You're offline.");
    act(() => setOnline(true));
    expect(main().reason).toBe("Pick a shipping method.");

    // Picked: nothing to say, and Place can be pressed.
    act(() => result.current.form.setValue("shippingMethod", "courier"));
    expect(main()).toMatchObject({ off: false, reason: null });

    // Taking the address apart again.
    act(() => result.current.checkout.setAddress({ ...EMPTY_ADDRESS, ...MIRA_ADDRESS, city: "" }));
    expect(main()).toMatchObject({ off: true, reason: "Fill in the address first." });
  });
});
