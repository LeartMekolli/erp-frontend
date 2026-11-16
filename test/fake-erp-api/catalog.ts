/**
 * The fake erp-api's catalog and the customer reads the New order page needs:
 * products with what each customer may see (`products.service.ts`,
 * `productListQuerySchema`), option groups, a customer and its saved
 * addresses (`customers.controller.ts:70,152`), and the delivery speeds a
 * customer's plan offers (`quotes.controller.ts`, `deliverySpeeds`).
 */

import type { CatalogProduct, Customer, CustomerAddresses, OptionGroup, SpeedChoice } from "../../src/lib/api/schema-types";

import type { Answer, Page } from "./orders";
import { CUSTOMERS } from "./orders-seed";
import { LUNA_ID, MIRA_ID, OLD_WORKS_ID } from "./seed";

export const CAST_RING_ID = "a1a1a1a1-0000-4000-8000-000000000001";
export const NAMEPLATE_ID = "a1a1a1a1-0000-4000-8000-000000000002";
export const GIFT_SET_ID = "a1a1a1a1-0000-4000-8000-000000000003";
/** Luna's own product: listed for Luna, hidden from everyone else. */
export const LUNA_LOGO_ID = "a1a1a1a1-0000-4000-8000-000000000004";
/** Never listed for a customer. */
export const DRAFT_PRODUCT_ID = "a1a1a1a1-0000-4000-8000-000000000005";

export const METAL_MATERIAL_GROUP_ID = "a2a2a2a2-0000-4000-8000-000000000001";
export const FINISH_GROUP_ID = "a2a2a2a2-0000-4000-8000-000000000002";
export const PRINT_MATERIAL_GROUP_ID = "a2a2a2a2-0000-4000-8000-000000000003";

export const SILVER_ID = "a3a3a3a3-0000-4000-8000-000000000001";
export const GOLD_ID = "a3a3a3a3-0000-4000-8000-000000000002";
export const BRASS_ID = "a3a3a3a3-0000-4000-8000-000000000003";
export const POLISHED_ID = "a3a3a3a3-0000-4000-8000-000000000004";
export const RAW_ID = "a3a3a3a3-0000-4000-8000-000000000005";
export const RESIN_ID = "a3a3a3a3-0000-4000-8000-000000000006";
export const NYLON_ID = "a3a3a3a3-0000-4000-8000-000000000007";
export const PLA_ID = "a3a3a3a3-0000-4000-8000-000000000008";

const CAST_CATEGORY_ID = "a4a4a4a4-0000-4000-8000-000000000001";
const PRINTED_CATEGORY_ID = "a4a4a4a4-0000-4000-8000-000000000002";
const ASSEMBLY_CATEGORY_ID = "a4a4a4a4-0000-4000-8000-000000000003";
const TRADE_GROUP_ID = "a4a4a4a4-0000-4000-8000-000000000010";

/** A material each material option value selects. */
const material = (n: number) => `a5a5a5a5-0000-4000-8000-00000000000${n}`;
/** The pinned design file of a ready-made product. */
const designFile = (n: number) => ({
  file_id: `a6a6a6a6-0000-4000-8000-00000000000${n}`,
  version_id: `a6a6a6a6-0000-4000-8000-00000000001${n}`,
});

const OPTION_GROUPS: OptionGroup[] = [
  {
    id: METAL_MATERIAL_GROUP_ID,
    key: "metal",
    name: "Material",
    values: [
      { id: SILVER_ID, group_id: METAL_MATERIAL_GROUP_ID, key: "silver_925", name: "Silver 925", material_id: material(1) },
      { id: GOLD_ID, group_id: METAL_MATERIAL_GROUP_ID, key: "gold_18k", name: "Gold 18k", material_id: material(2) },
      { id: BRASS_ID, group_id: METAL_MATERIAL_GROUP_ID, key: "brass", name: "Brass", material_id: material(3) },
    ],
  },
  {
    id: FINISH_GROUP_ID,
    key: "finish",
    name: "Finish",
    values: [
      { id: POLISHED_ID, group_id: FINISH_GROUP_ID, key: "polished", name: "Polished", material_id: null },
      { id: RAW_ID, group_id: FINISH_GROUP_ID, key: "raw", name: "Raw", material_id: null },
    ],
  },
  {
    id: PRINT_MATERIAL_GROUP_ID,
    key: "print_material",
    name: "Material",
    values: [
      { id: RESIN_ID, group_id: PRINT_MATERIAL_GROUP_ID, key: "resin_standard", name: "Standard resin", material_id: material(4) },
      { id: NYLON_ID, group_id: PRINT_MATERIAL_GROUP_ID, key: "nylon_pa12", name: "Nylon PA12", material_id: material(5) },
      { id: PLA_ID, group_id: PRINT_MATERIAL_GROUP_ID, key: "pla", name: "PLA", material_id: material(6) },
    ],
  },
];

const PRINT_MATERIAL_OPTION: CatalogProduct["options"][number] = {
  group_id: PRINT_MATERIAL_GROUP_ID,
  required: true,
  default_value_id: RESIN_ID,
  value_ids: [RESIN_ID, NYLON_ID, PLA_ID],
};

const NAMED_SIZES: CatalogProduct["sizing"] = {
  mode: "named",
  sizes: [
    { key: "S", scale: "0.8" },
    { key: "M", scale: "1" },
    { key: "L", scale: "1.25" },
  ],
};

const PRODUCTS: CatalogProduct[] = [
  {
    id: CAST_RING_ID,
    category_id: CAST_CATEGORY_ID,
    key: "cast_ring",
    name: "Cast ring",
    kind: "custom",
    status: "active",
    material_id: null,
    sizing: { mode: "range", min: "0.5", max: "3" },
    design_file: null,
    options: [
      { group_id: METAL_MATERIAL_GROUP_ID, required: true, default_value_id: SILVER_ID, value_ids: [SILVER_ID, GOLD_ID, BRASS_ID] },
      { group_id: FINISH_GROUP_ID, required: false, default_value_id: POLISHED_ID, value_ids: [POLISHED_ID, RAW_ID] },
    ],
    published: true,
    customer_id: null,
    parts: [],
  },
  {
    id: NAMEPLATE_ID,
    category_id: PRINTED_CATEGORY_ID,
    key: "nameplate",
    name: "Nameplate",
    kind: "ready_made",
    status: "active",
    material_id: null,
    sizing: NAMED_SIZES,
    design_file: designFile(1),
    options: [PRINT_MATERIAL_OPTION],
    published: true,
    customer_id: null,
    parts: [],
  },
  {
    id: GIFT_SET_ID,
    category_id: ASSEMBLY_CATEGORY_ID,
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
    parts: [{ product: { id: NAMEPLATE_ID, name: "Nameplate" }, quantity: 2, size: null }],
  },
  {
    id: LUNA_LOGO_ID,
    category_id: PRINTED_CATEGORY_ID,
    key: "luna_logo_stand",
    name: "Luna logo stand",
    kind: "ready_made",
    status: "active",
    material_id: null,
    sizing: { mode: "none" },
    design_file: designFile(2),
    options: [PRINT_MATERIAL_OPTION],
    published: true,
    customer_id: LUNA_ID,
    parts: [],
  },
  {
    id: DRAFT_PRODUCT_ID,
    category_id: PRINTED_CATEGORY_ID,
    key: "desk_tidy",
    name: "Desk tidy",
    kind: "ready_made",
    status: "draft",
    material_id: null,
    sizing: { mode: "none" },
    design_file: designFile(3),
    options: [PRINT_MATERIAL_OPTION],
    published: false,
    customer_id: null,
    parts: [],
  },
];

const SPEEDS: SpeedChoice[] = [
  { key: "standard", name: "Standard", working_days: 5, is_default: true },
  { key: "express", name: "Express", working_days: 2, is_default: false },
];

const PLANS = {
  free: { key: "free", name: "Free", speeds: ["standard", "express"] },
  starter: { key: "starter", name: "Starter", speeds: ["standard"] },
} as const;

interface FakeCustomer {
  view: Customer;
  plan: keyof typeof PLANS;
  addresses: CustomerAddresses;
}

const NO_ADDRESSES: CustomerAddresses = { shipping_address: null, billing_address: null, vat_number: null };

/** A customer record; anything not given is an active pay-first customer on Free with no saved address. */
function customer(id: string, name: string, extra: Partial<Customer> = {}, plan: keyof typeof PLANS = "free", addresses = NO_ADDRESSES): FakeCustomer {
  return {
    view: {
      id,
      name,
      status: "active",
      customer_group: null,
      member_count: 1,
      may_pick_partner: false,
      payment_terms: { terms: "pay_first", days_to_pay: 0, credit_limit: null },
      plan: { key: PLANS[plan].key, name: PLANS[plan].name },
      band: { key: "standard", name: "Standard" },
      created_at: "2026-01-05T09:00:00.000Z",
      ...extra,
    },
    plan,
    addresses,
  };
}

/** Luna, Mira and Old Works as the New order page needs them; every other customer `/search` finds gets the defaults. */
function seedCustomers(): Map<string, FakeCustomer> {
  const special = [
    customer(
      LUNA_ID,
      CUSTOMERS.luna.name,
      { customer_group: { id: TRADE_GROUP_ID, key: "trade", name: "Trade" }, may_pick_partner: true },
      "free",
      {
        shipping_address: {
          name: "Luna Jewels",
          line1: "12 rue des Orfèvres",
          city: "Lyon",
          postal_code: "69002",
          country: "FR",
          phone: "+33 4 72 00 00 00",
        },
        billing_address: null,
        vat_number: "FR00123456789",
      },
    ),
    customer(MIRA_ID, CUSTOMERS.mira.name, { payment_terms: { terms: "pay_later", days_to_pay: 30, credit_limit: "5000.00" } }, "starter"),
    customer(OLD_WORKS_ID, CUSTOMERS.oldWorks.name, { status: "disabled" }),
  ];
  const records = new Map(special.map((record) => [record.view.id, record]));
  for (const { id, name } of Object.values(CUSTOMERS)) if (!records.has(id)) records.set(id, customer(id, name));
  return records;
}

const CUSTOMER_NOT_FOUND = { ok: false, status: 404, detail: "Customer not found" } as const;

export function createCatalogStore() {
  const customers = seedCustomers();

  return {
    /** `GET /catalog/products`: with `customer_id`, only the active, published shared products and that customer's own. */
    products(customerId?: string | null, params: URLSearchParams = new URLSearchParams()): Answer<Page<CatalogProduct>> {
      const limit = Number(params.get("limit") ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) return { ok: false, status: 400, errors: [{ path: "limit", message: "must be 1 to 200" }] };
      const offset = Number(params.get("cursor") ?? 0);
      if (!Number.isInteger(offset) || offset < 0) return { ok: false, status: 400, errors: [{ path: "cursor", message: "Invalid cursor" }] };
      if (customerId !== undefined && customerId !== null && !customers.has(customerId)) return CUSTOMER_NOT_FOUND;
      const all =
        customerId === undefined || customerId === null
          ? PRODUCTS
          : PRODUCTS.filter(
              (p) => p.status === "active" && p.published && (p.customer_id === null || p.customer_id === customerId),
            );
      return {
        ok: true,
        body: {
          data: structuredClone(all.slice(offset, offset + limit)),
          next_cursor: offset + limit < all.length ? String(offset + limit) : null,
        },
      };
    },

    /** `GET /catalog/option-groups`. */
    optionGroups(): Answer<{ data: OptionGroup[] }> {
      return { ok: true, body: { data: structuredClone(OPTION_GROUPS) } };
    },

    /** `GET /customers/{id}`. */
    customer(id: string): Answer<Customer> {
      const record = customers.get(id);
      return record ? { ok: true, body: structuredClone(record.view) } : CUSTOMER_NOT_FOUND;
    },

    /** `GET /customers/{id}/addresses`. */
    addresses(id: string): Answer<CustomerAddresses> {
      const record = customers.get(id);
      return record ? { ok: true, body: structuredClone(record.addresses) } : CUSTOMER_NOT_FOUND;
    },

    /** `GET /pricing/quotes/delivery-speeds`: every speed, or with a customer only those its plan offers. */
    speeds(customerId?: string | null): Answer<{ data: SpeedChoice[] }> {
      if (customerId === undefined || customerId === null) return { ok: true, body: { data: structuredClone(SPEEDS) } };
      const record = customers.get(customerId);
      if (!record) return CUSTOMER_NOT_FOUND;
      const offered: readonly string[] = PLANS[record.plan].speeds;
      return { ok: true, body: { data: SPEEDS.filter((speed) => offered.includes(speed.key)).map((speed) => ({ ...speed })) } };
    },
  };
}

export type CatalogStore = ReturnType<typeof createCatalogStore>;
