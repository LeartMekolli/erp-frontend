import { z } from "zod";

import type { ApiProblem } from "@/lib/api/problem";
import type {
  Address,
  CatalogProduct,
  OptionGroup,
  PriceChangedProblem,
  ProductSizing,
  QuoteBody,
  QuoteRefusal,
} from "@/lib/api/schema-types";
import { canonical } from "@/lib/query/use-api-mutation";

/** Up to this many values an option shows as radios; above it, a select. */
export const RADIO_LIMIT = 6;

const QUANTITY_ERROR = "Enter a whole number from 1 to 1,000,000.";
const MAX_QUANTITY = 1_000_000;

const addressSchema = z.object({
  name: z.string().min(1).max(200),
  line1: z.string().min(1).max(200),
  line2: z.string().min(1).max(200).optional(),
  city: z.string().min(1).max(200),
  postal_code: z.string().min(1).max(20),
  region: z.string().max(100).optional(),
  country: z.string().regex(/^[A-Z]{2}$/),
  phone: z.string().max(40).optional(),
});

export const newOrderSchema = z.object({
  customerId: z.string(),
  productId: z.string(),
  options: z.record(z.string(), z.string()),
  size: z.string(),
  quantity: z.string().refine(validQuantity, QUANTITY_ERROR),
  declaredUnit: z.enum(["mm", "cm", "m", "in"]),
  speed: z.string(),
  /** `null` is the customer's saved address. */
  address: addressSchema.nullable(),
  shippingMethod: z.string(),
  note: z.string().max(2000, "Keep the note under 2,000 characters."),
});

export interface NewOrderValues {
  customerId: string;
  productId: string;
  /** Value key by option group key. */
  options: Record<string, string>;
  size: string;
  quantity: string;
  declaredUnit: "mm" | "cm" | "m" | "in";
  speed: string;
  address: Address | null;
  shippingMethod: string;
  note: string;
}

export const EMPTY_VALUES: NewOrderValues = {
  customerId: "",
  productId: "",
  options: {},
  size: "",
  quantity: "1",
  declaredUnit: "mm",
  speed: "",
  address: null,
  shippingMethod: "",
  note: "",
};

export interface OptionField {
  key: string;
  name: string;
  required: boolean;
  values: { key: string; name: string }[];
}

/** The product's option groups, named, in its own order, each with only the values it offers. */
export function optionFields(product: CatalogProduct, groups: OptionGroup[]): OptionField[] {
  const fields: OptionField[] = [];
  for (const option of product.options) {
    const group = groups.find((g) => g.id === option.group_id);
    if (!group) continue;
    const offered = new Set(option.value_ids);
    fields.push({
      key: group.key,
      name: group.name,
      required: option.required,
      values: group.values.filter((value) => offered.has(value.id)).map((value) => ({ key: value.key, name: value.name })),
    });
  }
  return fields;
}

/** Each group's default value key; groups with no default are left out. */
export function defaultOptions(product: CatalogProduct, groups: OptionGroup[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const option of product.options) {
    if (!option.default_value_id) continue;
    const group = groups.find((g) => g.id === option.group_id);
    const value = group?.values.find((v) => v.id === option.default_value_id);
    if (group && value) result[group.key] = value.key;
  }
  return result;
}

/** A decimal with at most four places. Scales aren't money, so they compare as numbers. */
const SCALE = /^\d+(\.\d{1,4})?$/;

/** Why the size can't be used for this product, or null when it can. */
export function sizeError(sizing: ProductSizing, size: string): string | null {
  const value = size.trim();
  if (sizing.mode === "none") return null;
  if (sizing.mode === "named") {
    return sizing.sizes.some((s) => s.key === value) ? null : "Pick a size.";
  }
  const message = `Enter a size between ${sizing.min} and ${sizing.max}.`;
  if (!SCALE.test(value)) return message;
  const scale = Number(value);
  return scale >= Number(sizing.min) && scale <= Number(sizing.max) ? null : message;
}

function validQuantity(quantity: string): boolean {
  return /^[1-9]\d*$/.test(quantity) && Number(quantity) <= MAX_QUANTITY;
}

/** Why the quantity can't be used, or null when it can. */
export function quantityError(quantity: string): string | null {
  return validQuantity(quantity) ? null : QUANTITY_ERROR;
}

/**
 * What to ask erp-api to price, or null while the form can't be priced yet:
 * no customer, a bad quantity or size, or a custom product with no measured model.
 * Never names a workshop.
 */
export function quoteBody(values: NewOrderValues, product: CatalogProduct, versionId: string | undefined): QuoteBody | null {
  if (!values.customerId || !validQuantity(values.quantity)) return null;
  if (sizeError(product.sizing, values.size) !== null) return null;
  if (product.kind === "custom" && !versionId) return null;

  const body: QuoteBody = {
    customer_id: values.customerId,
    product_id: product.id,
    options: Object.fromEntries(Object.entries(values.options).filter(([, value]) => value !== "")),
    quantity: Number(values.quantity),
  };
  const size = values.size.trim();
  if (product.sizing.mode === "range") body.size = { scale: size };
  if (product.sizing.mode === "named") body.size = { named: size };
  if (product.kind === "custom" && versionId) body.file_version_id = versionId;
  if (values.speed) body.delivery_speed = values.speed;
  return body;
}

/** The same body is the same key, whatever order its fields were written in. */
export function bodyKey(body: QuoteBody): string {
  return JSON.stringify(canonical(body));
}

/** Which form field a quote refusal belongs under; null when it only shows above the form. */
export function refusalField(code: QuoteRefusal["code"]): "options" | "size" | "model" | "quantity" | null {
  switch (code) {
    case "unknown_group":
    case "unknown_value":
    case "value_not_offered":
    case "required_missing":
    case "rule_excludes":
    case "rule_requires":
      return "options";
    case "size_out_of_range":
    case "unknown_size":
    case "not_sizeable":
      return "size";
    case "file_required":
    case "file_not_measured":
    case "measure_missing":
    case "unit_mismatch":
      return "model";
    case "quantity_too_large":
      return "quantity";
    default:
      return null;
  }
}

export type PlaceRefusal =
  | { kind: "price_changed"; line: PriceChangedProblem["lines"][number] }
  | { kind: "other"; message: string };

/** Reads a refused place: a changed price by its `code`, anything else as what erp-api says. */
export function placeRefusal(problem: ApiProblem): PlaceRefusal {
  if (problem.code === "price_changed") {
    const lines = problem.lines as PriceChangedProblem["lines"] | undefined;
    const line = Array.isArray(lines) ? lines[0] : undefined;
    if (line) return { kind: "price_changed", line };
  }
  const fields = problem.errors?.map((error) => error.message).join(" ");
  return { kind: "other", message: problem.detail ?? (fields || problem.title) };
}
