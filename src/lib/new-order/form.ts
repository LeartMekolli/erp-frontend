import { COPY } from "@/components/new-order/copy";
import type { ApiProblem } from "@/lib/api/problem";
import type {
  Address,
  CatalogProduct,
  OptionGroup,
  PlaceOrderBody,
  PriceChangedProblem,
  ProductSizing,
  QuoteBody,
  QuoteRefusal,
} from "@/lib/api/schema-types";
import { canonical } from "@/lib/query/use-api-mutation";

/** Up to this many values an option shows as radios; above it, a select. */
export const RADIO_LIMIT = 6;

const MAX_QUANTITY = 1_000_000;

/** The longest note erp-api takes. */
export const MAX_NOTE = 2000;

/** What the form holds. It is checked by `quoteBody`, `addressProblems`, `placeBody` and `quantityError`, not by a schema. */
export interface NewOrderValues {
  customerId: string;
  productId: string;
  /** Value key by option group key. */
  options: Record<string, string>;
  size: string;
  quantity: string;
  declaredUnit: "mm" | "cm" | "m" | "in";
  speed: string;
  /** `null` is the customer's saved address. */
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
  /** Whether the product starts this group on a value. erp-api fills in a group left out with it, so such a group can't be left out. */
  hasDefault: boolean;
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
      hasDefault: option.default_value_id !== null,
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
    return sizing.sizes.some((s) => s.key === value) ? null : COPY.product.sizePick;
  }
  const message = COPY.product.sizeRange(sizing.min, sizing.max);
  if (!SCALE.test(value)) return message;
  const scale = Number(value);
  return scale >= Number(sizing.min) && scale <= Number(sizing.max) ? null : message;
}

function validQuantity(quantity: string): boolean {
  return /^[1-9]\d*$/.test(quantity) && Number(quantity) <= MAX_QUANTITY;
}

/** Why the quantity can't be used, or null when it can. */
export function quantityError(quantity: string): string | null {
  return validQuantity(quantity) ? null : COPY.product.quantityError;
}

/**
 * What to ask erp-api to price, or null while the form can't be priced yet:
 * no customer, a bad quantity or size, or a custom product with no measured model.
 * Never names a workshop.
 */
export function quoteBody(
  values: Pick<NewOrderValues, "customerId" | "options" | "size" | "quantity" | "speed">,
  product: CatalogProduct,
  versionId: string | undefined,
): QuoteBody | null {
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

/** An address's fields, in the order the address form asks for them. */
export const ADDRESS_FIELDS = ["name", "line1", "line2", "city", "postal_code", "region", "country", "phone"] as const satisfies readonly (keyof Address)[];

export type AddressField = (typeof ADDRESS_FIELDS)[number];

/** erp-api's longest value for each field (`order-response.ts:14`); a country is two capital letters. */
export const ADDRESS_LIMITS: Record<AddressField, number> = {
  name: 200,
  line1: 200,
  line2: 200,
  city: 200,
  postal_code: 20,
  region: 100,
  country: 2,
  phone: 40,
};

/** The address fields erp-api lets stay blank. */
export const OPTIONAL_ADDRESS_FIELDS = ["line2", "region", "phone"] as const satisfies readonly AddressField[];

/** An address form with nothing typed in yet. */
export const EMPTY_ADDRESS: Address = { name: "", line1: "", line2: "", city: "", postal_code: "", region: "", country: "", phone: "" };

/** Why an address field can't be sent as it is. */
export type AddressProblem = "missing" | "too_long" | "country";

const isOptional = (field: AddressField) => (OPTIONAL_ADDRESS_FIELDS as readonly string[]).includes(field);

/** What is wrong with each field of a typed address, trimmed; fields that are fine are left out. */
export function addressProblems(draft: Address): Partial<Record<AddressField, AddressProblem>> {
  const problems: Partial<Record<AddressField, AddressProblem>> = {};
  for (const field of ADDRESS_FIELDS) {
    const value = (draft[field] ?? "").trim();
    if (value === "") {
      if (!isOptional(field)) problems[field] = "missing";
    } else if (field === "country") {
      if (!/^[A-Z]{2}$/.test(value)) problems[field] = "country";
    } else if (value.length > ADDRESS_LIMITS[field]) {
      problems[field] = "too_long";
    }
  }
  return problems;
}

/** A typed address as erp-api takes it: each field trimmed, blank optional ones left out. Null while any field is wrong. */
export function orderAddress(draft: Address): Address | null {
  if (Object.keys(addressProblems(draft)).length > 0) return null;
  const value = (field: AddressField) => (draft[field] ?? "").trim();
  const address: Address = {
    name: value("name"),
    line1: value("line1"),
    city: value("city"),
    postal_code: value("postal_code"),
    country: value("country"),
  };
  for (const field of OPTIONAL_ADDRESS_FIELDS) {
    const text = value(field);
    if (text !== "") address[field] = text;
  }
  return address;
}

/**
 * What to place: the shown quote, the shipping method, the address only when it isn't the saved one
 * (`address` null), and the note trimmed, only when it isn't blank. Null while there is no customer
 * or method, or the typed address or the note can't be sent.
 */
export function placeBody(
  values: Pick<NewOrderValues, "customerId" | "address" | "shippingMethod" | "note">,
  quoteId: string,
): PlaceOrderBody | null {
  if (!values.customerId || !values.shippingMethod) return null;
  const body: PlaceOrderBody = {
    customer_id: values.customerId,
    lines: [{ quote_id: quoteId }],
    shipping_method: values.shippingMethod,
  };
  if (values.address !== null) {
    const address = orderAddress(values.address);
    if (!address) return null;
    body.address = address;
  }
  const note = values.note.trim();
  if (note.length > MAX_NOTE) return null;
  if (note !== "") body.note = note;
  return body;
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
