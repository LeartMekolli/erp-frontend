import { describe, expect, it } from "vitest";

import type { ApiProblem } from "@/lib/api/problem";
import type { CatalogProduct, OptionGroup, QuoteRefusal } from "@/lib/api/schema-types";

import { EMPTY_VALUES, bodyKey, defaultOptions, newOrderSchema, optionFields, placeRefusal, quoteBody, refusalField, sizeError } from "./form";
import type { NewOrderValues } from "./form";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const VERSION = "33333333-3333-4333-8333-333333333333";

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: PRODUCT,
    category_id: "44444444-4444-4444-8444-444444444444",
    key: "ring",
    name: "Ring",
    kind: "ready_made",
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

const groups: OptionGroup[] = [
  {
    id: "g-metal",
    key: "metal",
    name: "Metal",
    values: [
      { id: "v-silver", group_id: "g-metal", key: "silver", name: "Silver 925", material_id: null },
      { id: "v-gold", group_id: "g-metal", key: "gold", name: "Gold 18k", material_id: null },
      { id: "v-brass", group_id: "g-metal", key: "brass", name: "Brass", material_id: null },
    ],
  },
  {
    id: "g-finish",
    key: "finish",
    name: "Finish",
    values: [
      { id: "v-polished", group_id: "g-finish", key: "polished", name: "Polished", material_id: null },
      { id: "v-matte", group_id: "g-finish", key: "matte", name: "Matte", material_id: null },
    ],
  },
];

const values: NewOrderValues = { ...EMPTY_VALUES, customerId: CUSTOMER, productId: PRODUCT, quantity: "10" };

describe("new order form", () => {
  it("builds a scale size for a range product", () => {
    const ranged = product({ sizing: { mode: "range", min: "0.5", max: "3" } });
    expect(quoteBody({ ...values, size: "1.5", options: { metal: "gold" } }, ranged, undefined)).toEqual({
      customer_id: CUSTOMER,
      product_id: PRODUCT,
      options: { metal: "gold" },
      size: { scale: "1.5" },
      quantity: 10,
    });
    expect(quoteBody({ ...values, size: "4" }, ranged, undefined)).toBeNull();
  });

  it("builds a named size", () => {
    const named = product({ sizing: { mode: "named", sizes: [{ key: "small", scale: "0.8" }, { key: "large", scale: "1.2" }] } });
    expect(quoteBody({ ...values, size: "large", speed: "express" }, named, undefined)?.size).toEqual({ named: "large" });
    expect(quoteBody({ ...values, size: "large", speed: "express" }, named, undefined)?.delivery_speed).toBe("express");
    expect(quoteBody({ ...values, size: "huge" }, named, undefined)).toBeNull();
  });

  it("leaves size out for none", () => {
    const body = quoteBody({ ...values, size: "2" }, product(), undefined);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("size");
    expect(body).not.toHaveProperty("delivery_speed");
    expect(body).not.toHaveProperty("partner_id");
  });

  it("is null for a custom product with no model", () => {
    const custom = product({ kind: "custom" });
    expect(quoteBody(values, custom, undefined)).toBeNull();
    expect(quoteBody(values, custom, VERSION)?.file_version_id).toBe(VERSION);
    expect(quoteBody({ ...values, customerId: "" }, product(), undefined)).toBeNull();
    expect(quoteBody({ ...values, quantity: "0" }, product(), undefined)).toBeNull();
    expect(quoteBody({ ...values, quantity: "1000001" }, product(), undefined)).toBeNull();
  });

  it("keys the same body the same whatever the key order", () => {
    const a = { customer_id: CUSTOMER, product_id: PRODUCT, quantity: 2, options: { metal: "gold", finish: "matte" } };
    const b = { options: { finish: "matte", metal: "gold" }, quantity: 2, product_id: PRODUCT, customer_id: CUSTOMER };
    expect(bodyKey(a)).toBe(bodyKey(b));
    expect(bodyKey(a)).not.toBe(bodyKey({ ...a, quantity: 3 }));
  });

  it("maps each refusal code to its field", () => {
    const table: [QuoteRefusal["code"], ReturnType<typeof refusalField>][] = [
      ["unknown_group", "options"],
      ["unknown_value", "options"],
      ["value_not_offered", "options"],
      ["required_missing", "options"],
      ["rule_excludes", "options"],
      ["rule_requires", "options"],
      ["size_out_of_range", "size"],
      ["unknown_size", "size"],
      ["not_sizeable", "size"],
      ["file_required", "model"],
      ["file_not_measured", "model"],
      ["measure_missing", "model"],
      ["unit_mismatch", "model"],
      ["quantity_too_large", "quantity"],
      ["price_missing", null],
      ["partner_unavailable", null],
    ];
    for (const [code, field] of table) expect(refusalField(code), code).toBe(field);
  });

  it("reads price_changed by code", () => {
    const line = { position: 0, previous_quote_id: "q1", quote: null, reasons: [] };
    const problem = { type: "urn:problem:conflict", title: "Conflict", status: 409, detail: "Prices changed.", code: "price_changed", lines: [line] } as ApiProblem;
    expect(placeRefusal(problem)).toEqual({ kind: "price_changed", line });
  });

  it("reads any other refusal as its detail", () => {
    const detail = { type: "x", title: "Conflict", status: 409, detail: "That quote is already ordered." } as ApiProblem;
    expect(placeRefusal(detail)).toEqual({ kind: "other", message: "That quote is already ordered." });
    const fields = {
      type: "x",
      title: "Validation failed",
      status: 400,
      errors: [
        { path: "shipping_method", message: "No rate." },
        { path: "address.city", message: "Required." },
      ],
    } as ApiProblem;
    expect(placeRefusal(fields)).toEqual({ kind: "other", message: "No rate. Required." });
  });

  it("sizeError refuses 3.5 and 0.12345", () => {
    const sizing = { mode: "range", min: "0.5", max: "3" } as const;
    expect(sizeError(sizing, "3.5")).toBe("Enter a size between 0.5 and 3.");
    expect(sizeError(sizing, "0.12345")).toBe("Enter a size between 0.5 and 3.");
    expect(sizeError(sizing, "")).toBe("Enter a size between 0.5 and 3.");
    expect(sizeError(sizing, "0.5")).toBeNull();
    expect(sizeError(sizing, "3")).toBeNull();
    expect(sizeError(sizing, "1.2345")).toBeNull();
    expect(sizeError({ mode: "named", sizes: [{ key: "small", scale: "0.8" }] }, "")).toBe("Pick a size.");
    expect(sizeError({ mode: "named", sizes: [{ key: "small", scale: "0.8" }] }, "small")).toBeNull();
    expect(sizeError({ mode: "none" }, "")).toBeNull();
  });

  it("defaults each group to its default value", () => {
    const p = product({
      options: [
        { group_id: "g-metal", required: true, default_value_id: "v-gold", value_ids: ["v-silver", "v-gold"] },
        { group_id: "g-finish", required: false, default_value_id: null, value_ids: ["v-matte", "v-polished"] },
        { group_id: "g-missing", required: false, default_value_id: "v-x", value_ids: ["v-x"] },
      ],
    });
    expect(defaultOptions(p, groups)).toEqual({ metal: "gold" });
    expect(optionFields(p, groups)).toEqual([
      { key: "metal", name: "Metal", required: true, values: [{ key: "silver", name: "Silver 925" }, { key: "gold", name: "Gold 18k" }] },
      { key: "finish", name: "Finish", required: false, values: [{ key: "polished", name: "Polished" }, { key: "matte", name: "Matte" }] },
    ]);
  });

  it("checks quantity and note", () => {
    const check = (patch: Partial<NewOrderValues>) => newOrderSchema.safeParse({ ...values, ...patch });
    expect(check({}).success).toBe(true);
    expect(check({ quantity: "1000000" }).success).toBe(true);
    for (const quantity of ["0", "1000001", "1.5", "", "007"]) expect(check({ quantity }).success, quantity).toBe(false);
    const note = check({ note: "x".repeat(2001) });
    expect(note.success).toBe(false);
    if (!note.success) expect(note.error.issues[0]?.message).toBe("Keep the note under 2,000 characters.");
  });
});
