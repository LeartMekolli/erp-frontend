/**
 * The fake erp-api's catalog and customers: products with what each customer
 * may see (`products.service.ts`, `productListQuerySchema`), option groups,
 * the customer list with its search and filters, a customer, its saved
 * addresses and payment terms, its money (`customers.controller.ts`,
 * `payment-terms.controller.ts`, `credit.controller.ts`), and the delivery
 * speeds a customer's plan offers (`quotes.controller.ts`, `deliverySpeeds`).
 */

import type {
  Address,
  BandChoice,
  CatalogProduct,
  CreatedCustomer,
  Customer,
  CustomerAddresses,
  CustomerGroupChoice,
  CustomerInvoice,
  CustomerMoney,
  InvitationEmailStatus,
  Order,
  OptionGroup,
  SentInvitation,
  SpeedChoice,
} from "../../src/lib/api/schema-types";

import type { Answer, FieldError, Page } from "./orders";
import { CUSTOMERS } from "./orders-seed";
import { LUNA_ID, MIRA_ID, OLD_WORKS_ID, USERS, WORKSPACE_INFO } from "./seed";

/** The workspace's currency, which every customer's money is in (`workspace-currency.ts`, erp-api PR #39). */
const CURRENCY = WORKSPACE_INFO.default_currency;

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
export const TRADE_GROUP_ID = "a4a4a4a4-0000-4000-8000-000000000010";

/** `GET /customers/groups`: erp-api's seed files Luna under Trade. */
const GROUPS: CustomerGroupChoice[] = [{ id: TRADE_GROUP_ID, key: "trade", name: "Trade" }];

/** `GET /customers/bands`: the default band, then erp-api's seeded Gold and Silver (`seed-customers.ts:42-49`). */
const BANDS: BandChoice[] = [
  { key: "standard", name: "Standard", default: true },
  { key: "gold", name: "Gold", default: false },
  { key: "silver", name: "Silver", default: false },
];
const GOLD = { key: "gold", name: "Gold" };

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

/** When each customer joined: the list is newest first, and Luna has been a customer since March 2026. */
const JOINED: Record<string, string> = {
  [CUSTOMERS.fieldnote.id]: "2026-01-08T09:00:00.000Z",
  [CUSTOMERS.luna.id]: "2026-03-12T09:00:00.000Z",
  [CUSTOMERS.orbit.id]: "2026-04-02T09:00:00.000Z",
  [CUSTOMERS.mira.id]: "2026-05-20T09:00:00.000Z",
  [CUSTOMERS.kestrel.id]: "2026-06-15T09:00:00.000Z",
  [CUSTOMERS.halden.id]: "2026-07-01T09:00:00.000Z",
  [CUSTOMERS.pinewood.id]: "2026-08-11T09:00:00.000Z",
  [CUSTOMERS.northside.id]: "2026-09-03T09:00:00.000Z",
  [CUSTOMERS.brightline.id]: "2026-10-06T09:00:00.000Z",
  [CUSTOMERS.oldWorks.id]: "2026-02-14T09:00:00.000Z",
};

/** Pay later as erp-api's seed sets it for customers billed by invoice; the orders seed invoices Orbit, Pinewood and Brightline. */
const PAY_LATER = { terms: "pay_later", days_to_pay: 30, credit_limit: null, currency: CURRENCY } as const;
const INVOICED = new Set<string>([CUSTOMERS.orbit.id, CUSTOMERS.pinewood.id, CUSTOMERS.brightline.id]);

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
      // erp-api answers the default 30 days for pay first too (`payment-response.ts:61-69`).
      payment_terms: INVOICED.has(id) ? { ...PAY_LATER } : { terms: "pay_first", days_to_pay: 30, credit_limit: null, currency: CURRENCY },
      plan: { key: PLANS[plan].key, name: PLANS[plan].name },
      band: { key: "standard", name: "Standard" },
      created_at: JOINED[id] ?? "2026-01-05T09:00:00.000Z",
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
    customer(MIRA_ID, CUSTOMERS.mira.name, { payment_terms: { terms: "pay_later", days_to_pay: 30, credit_limit: "5000.00", currency: CURRENCY }, band: GOLD }, "starter"),
    customer(OLD_WORKS_ID, CUSTOMERS.oldWorks.name, { status: "disabled" }),
  ];
  const records = new Map(special.map((record) => [record.view.id, record]));
  for (const { id, name } of Object.values(CUSTOMERS)) if (!records.has(id)) records.set(id, customer(id, name));
  return records;
}

const CUSTOMER_NOT_FOUND = { ok: false, status: 404, detail: "Customer not found" } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** erp-api's credit limit (`payment-response.ts:44-47`). */
const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;
/** An email, as far as these tests need (`identity/email.ts:4`). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Roles inside a customer organisation (`customer-roles.ts:2`). */
const CUSTOMER_ROLES: readonly string[] = ["viewer", "buyer", "admin", "owner"];
/** How long an invitation holds (`identity/invitations.ts`, `INVITATION_DAYS`). */
const INVITATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Someone to invite, as erp-api's `inviteSchema` reads them (`customers.service.ts:37`). */
type Invitee = { email: string; role: SentInvitation["role"] };

/** erp-api's `inviteSchema`: the email trimmed and lower-cased, and a customer role; errors' paths start with `prefix`. */
function inviteeOf(given: unknown, prefix: string): Invitee | { errors: FieldError[] } {
  if (!isObject(given)) return { errors: [{ path: prefix ? prefix.slice(0, -1) : "", message: "Expected an object" }] };
  const errors: FieldError[] = [];
  const email = typeof given.email === "string" ? given.email.trim().toLowerCase() : null;
  if (email === null || email.length > 320 || !EMAIL.test(email)) errors.push({ path: `${prefix}email`, message: "Invalid email address" });
  const role = typeof given.role === "string" && CUSTOMER_ROLES.includes(given.role) ? (given.role as Invitee["role"]) : null;
  if (role === null) errors.push({ path: `${prefix}role`, message: 'Expected "viewer", "buyer", "admin" or "owner"' });
  return errors.length > 0 || email === null || role === null ? { errors } : { email, role };
}

const isStaffEmail = (email: string) => USERS.some((user) => user.kind === "staff" && user.email.toLowerCase() === email);

/** A staff email can't act for a customer: a 409 naming the email field at `path`. */
const staffEmailRefusal = (path: string): Answer<never> => ({
  ok: false,
  status: 409,
  detail: "That email already has an account",
  errors: [{ path, message: "That email already has an account" }],
});

const invalid = (errors: FieldError[]) => ({ ok: false, status: 400, errors }) as const;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Keys a strict Zod object refuses (`z.strictObject`), one error naming each. */
function unknownKeys(body: Record<string, unknown>, allowed: string[]): FieldError[] {
  return Object.keys(body)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ path: key, message: `Unrecognized key: "${key}"` }));
}

/** A trimmed name of 1 to `max` characters, as erp-api's `z.string().trim().min(1).max(max)`; null when it isn't one. */
function trimmed(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

/** erp-api's `addressSchema` (`order-response.ts:14`): the errors under `path`, none for a good address. */
function addressErrors(value: unknown, path: string): FieldError[] {
  if (!isObject(value)) return [{ path, message: "Expected an address" }];
  const errors: FieldError[] = [];
  for (const key of ["name", "line1", "city"] as const) {
    if (trimmed(value[key], 200) === null) errors.push({ path: `${path}.${key}`, message: "Required" });
  }
  if (trimmed(value.postal_code, 20) === null) errors.push({ path: `${path}.postal_code`, message: "Required, at most 20 characters" });
  if (typeof value.country !== "string" || !/^[A-Z]{2}$/.test(value.country)) errors.push({ path: `${path}.country`, message: "Expected a two-letter country code" });
  return errors;
}

/** An amount string in cents, so sums never go through a float. */
const cents = (amount: string) => {
  const [whole = "0", part = ""] = amount.split(".");
  return Number(whole) * 100 + Number(part.padEnd(2, "0").slice(0, 2));
};
const fromCents = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

/**
 * `orders` gives the customer's money its invoices: each order's open invoice, overdue once the order's
 * payment is, so Money and the customer's orders always agree.
 */
export function createCatalogStore(orders: () => Order[] = () => []) {
  const customers = seedCustomers();
  const keys = new Map<string, { input: string; body: CreatedCustomer }>();
  const inviteKeys = new Map<string, { input: string; body: SentInvitation }>();
  const invited: { customerId: string; email: string; role: string; invitedBy: string }[] = [];
  let emailStatus: InvitationEmailStatus = "queued";

  /** Saves the invitation, replacing an earlier one to the same email, and answers it with what became of its email. */
  function invite(customerId: string, { email, role }: Invitee, invitedBy: string): SentInvitation {
    const earlier = invited.findIndex((entry) => entry.customerId === customerId && entry.email === email);
    if (earlier !== -1) invited.splice(earlier, 1);
    invited.push({ customerId, email, role, invitedBy });
    return { id: crypto.randomUUID(), email, role, expires_at: new Date(Date.now() + INVITATION_MS).toISOString(), email_status: emailStatus };
  }

  return {
    /** `GET /customers`: newest first, searched by name or matched on the whole name, and narrowed by status, group (or none) and band. */
    list(params: URLSearchParams): Answer<Page<Customer>> {
      const errors: FieldError[] = [];
      const limit = Number(params.get("limit") ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) errors.push({ path: "limit", message: "must be 1 to 200" });
      const offset = Number(params.get("cursor") ?? 0);
      if (!Number.isInteger(offset) || offset < 0) errors.push({ path: "cursor", message: "Invalid cursor" });
      const rawQ = params.get("q");
      const q = rawQ === null ? null : trimmed(rawQ, 100);
      if (rawQ !== null && q === null) errors.push({ path: "q", message: "Must be 1 to 100 characters" });
      // The whole name, in any case but not ignoring accents, every character literal (erp-api PR #41).
      const rawName = params.get("name");
      const exactName = rawName === null ? null : trimmed(rawName, 200);
      if (rawName !== null && exactName === null) errors.push({ path: "name", message: "Must be 1 to 200 characters" });
      const status = params.get("status");
      if (status !== null && status !== "active" && status !== "disabled") errors.push({ path: "status", message: 'Expected "active" or "disabled"' });
      const group = params.get("customer_group");
      if (group !== null && group !== "none" && !UUID.test(group)) errors.push({ path: "customer_group", message: "Expected a group id or none" });
      if (errors.length > 0) return invalid(errors);
      // An unknown group or band is a 400 (`customers.service.ts`).
      if (group !== null && group !== "none" && !GROUPS.some((choice) => choice.id === group)) return invalid([{ path: "customer_group", message: "Unknown customer group" }]);
      const band = params.get("band");
      if (band !== null && !BANDS.some((choice) => choice.key === band)) return invalid([{ path: "band", message: "Unknown band" }]);

      const all = [...customers.values()]
        .map((record) => record.view)
        .filter(
          (view) =>
            (q === null || view.name.toLowerCase().includes(q.toLowerCase())) &&
            (exactName === null || view.name.localeCompare(exactName, undefined, { sensitivity: "accent" }) === 0) &&
            (status === null || view.status === status) &&
            (group === null || (group === "none" ? view.customer_group === null : view.customer_group?.id === group)) &&
            (band === null || view.band.key === band),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return {
        ok: true,
        body: { data: structuredClone(all.slice(offset, offset + limit)), next_cursor: offset + limit < all.length ? String(offset + limit) : null },
      };
    },

    /** `GET /customers/groups`. */
    groups(): Answer<{ data: CustomerGroupChoice[] }> {
      return { ok: true, body: { data: structuredClone(GROUPS) } };
    },

    /** `GET /customers/bands`: the default band first. */
    bands(): Answer<{ data: BandChoice[] }> {
      return { ok: true, body: { data: structuredClone(BANDS) } };
    },

    /**
     * `POST /customers` (`customers.service.ts:38-51`, `:150-200`): a pay-first customer on the default plan,
     * with the addresses and first invitation the body names. Unknown keys are dropped, as `z.object` does;
     * `payment_terms` is never read, as AMI doesn't send it. The same key and input replays the first answer.
     */
    create(body: unknown, key: string | null, invitedBy: string): Answer<CreatedCustomer> {
      const input = JSON.stringify(body);
      const seen = key ? keys.get(key) : undefined;
      if (seen) {
        return seen.input === input
          ? { ok: true, body: structuredClone(seen.body) }
          : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };
      }
      if (!isObject(body)) return invalid([{ path: "", message: "Expected an object" }]);

      const errors: FieldError[] = [];
      const name = trimmed(body.name, 200);
      if (name === null) errors.push({ path: "name", message: "Must be 1 to 200 characters" });
      const groupId = body.customer_group_id;
      if (groupId !== undefined && (typeof groupId !== "string" || !UUID.test(groupId))) errors.push({ path: "customer_group_id", message: "Expected a group id" });
      if (body.may_pick_partner !== undefined && typeof body.may_pick_partner !== "boolean") errors.push({ path: "may_pick_partner", message: "Expected a boolean" });
      for (const part of ["shipping_address", "billing_address"] as const) {
        if (body[part] !== undefined && body[part] !== null) errors.push(...addressErrors(body[part], part));
      }
      const vat = body.vat_number === undefined || body.vat_number === null ? null : trimmed(body.vat_number, 40);
      if (vat === null && body.vat_number !== undefined && body.vat_number !== null) errors.push({ path: "vat_number", message: "Must be 1 to 40 characters" });

      let invitation: Invitee | null = null;
      if (body.invitation !== undefined) {
        const given = inviteeOf(body.invitation, "invitation.");
        if ("errors" in given) errors.push(...given.errors);
        else if (errors.length === 0) invitation = given;
      }
      if (errors.length > 0) return invalid(errors);

      const group = typeof groupId === "string" ? GROUPS.find((choice) => choice.id === groupId) : undefined;
      if (typeof groupId === "string" && !group) return { ok: false, status: 404, detail: "Customer group not found" };
      // An email that already belongs to staff can't be invited (`:62-75`, `:182-187`).
      if (invitation && isStaffEmail(invitation.email)) return staffEmailRefusal("invitation.email");

      // Always the newest, so it heads the list whatever the clock says.
      const latest = [...customers.values()].reduce((max, record) => (record.view.created_at > max ? record.view.created_at : max), "");
      const now = new Date().toISOString();
      const createdAt = now > latest ? now : new Date(Date.parse(latest) + 1).toISOString();
      const id = crypto.randomUUID();
      const record = customer(id, name as string, {
        customer_group: group ? { ...group } : null,
        may_pick_partner: body.may_pick_partner === true,
        member_count: 0,
        created_at: createdAt,
      });
      record.addresses = {
        shipping_address: isObject(body.shipping_address) ? structuredClone(body.shipping_address as unknown as Address) : null,
        billing_address: isObject(body.billing_address) ? structuredClone(body.billing_address as unknown as Address) : null,
        vat_number: vat,
      };
      customers.set(id, record);
      const created: CreatedCustomer = { ...structuredClone(record.view), invitation: invitation ? invite(id, invitation, invitedBy) : null };
      if (key) keys.set(key, { input, body: structuredClone(created) });
      return { ok: true, body: created };
    },

    /**
     * `POST /customers/{id}/invitations` (`customer-invitations.service.ts`, `inviteAndReport`): invites
     * someone by email, or the same email again, which replaces the earlier invitation. The answer's
     * `email_status` is what `setInvitationEmail` chose. The same key and input replays the first answer.
     */
    invite(customerId: string, body: unknown, key: string | null, invitedBy: string): Answer<SentInvitation> {
      const input = JSON.stringify({ customerId, body });
      const seen = key ? inviteKeys.get(key) : undefined;
      if (seen) {
        return seen.input === input
          ? { ok: true, body: structuredClone(seen.body) }
          : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };
      }
      if (!customers.has(customerId)) return CUSTOMER_NOT_FOUND;
      const given = inviteeOf(body, "");
      if ("errors" in given) return invalid(given.errors);
      if (isStaffEmail(given.email)) return staffEmailRefusal("email");
      const sent = invite(customerId, given, invitedBy);
      if (key) inviteKeys.set(key, { input, body: structuredClone(sent) });
      return { ok: true, body: sent };
    },

    /** What becomes of the next invitation emails (`email_status`); "queued" until a test says otherwise. */
    setInvitationEmail(status: InvitationEmailStatus): void {
      emailStatus = status;
    },

    /** The invitations `create` and `invite` took, one per customer and email, for tests to read. */
    invitations(): { customerId: string; email: string; role: string }[] {
      return invited.map(({ customerId, email, role }) => ({ customerId, email, role }));
    },

    /** Every customer's id and name, for `GET /search`. */
    names(): { id: string; name: string }[] {
      return [...customers.values()].map(({ view }) => ({ id: view.id, name: view.name }));
    },

    /** `PATCH /customers/{id}`: only the fields sent change; unknown keys are dropped, as `z.object` does. */
    update(id: string, body: unknown): Answer<Customer> {
      const record = customers.get(id);
      if (!record) return CUSTOMER_NOT_FOUND;
      if (!isObject(body)) return invalid([{ path: "", message: "Expected an object" }]);
      const errors: FieldError[] = [];
      const name = body.name === undefined ? undefined : trimmed(body.name, 200);
      if (name === null) errors.push({ path: "name", message: "Must be 1 to 200 characters" });
      if (body.status !== undefined && body.status !== "active" && body.status !== "disabled") errors.push({ path: "status", message: 'Expected "active" or "disabled"' });
      const groupId = body.customer_group_id;
      if (groupId !== undefined && groupId !== null && (typeof groupId !== "string" || !UUID.test(groupId))) errors.push({ path: "customer_group_id", message: "Expected a group id or null" });
      if (body.may_pick_partner !== undefined && typeof body.may_pick_partner !== "boolean") errors.push({ path: "may_pick_partner", message: "Expected a boolean" });
      if (errors.length > 0) return invalid(errors);
      const group = typeof groupId === "string" ? GROUPS.find((choice) => choice.id === groupId) : undefined;
      if (typeof groupId === "string" && !group) return { ok: false, status: 404, detail: "Customer group not found" };

      const view = record.view;
      if (typeof name === "string") view.name = name;
      if (body.status === "active" || body.status === "disabled") view.status = body.status;
      if (groupId === null) view.customer_group = null;
      if (group) view.customer_group = { ...group };
      if (typeof body.may_pick_partner === "boolean") view.may_pick_partner = body.may_pick_partner;
      return { ok: true, body: structuredClone(view) };
    },

    /** `PUT /customers/{id}/addresses`: only the fields sent change, and null clears one. */
    setAddresses(id: string, body: unknown): Answer<CustomerAddresses> {
      const record = customers.get(id);
      if (!record) return CUSTOMER_NOT_FOUND;
      if (!isObject(body)) return invalid([{ path: "", message: "Expected an object" }]);
      const errors = unknownKeys(body, ["shipping_address", "billing_address", "vat_number"]);
      for (const key of ["shipping_address", "billing_address"] as const) {
        if (body[key] !== undefined && body[key] !== null) errors.push(...addressErrors(body[key], key));
      }
      const vat = body.vat_number === undefined || body.vat_number === null ? body.vat_number : trimmed(body.vat_number, 40);
      if (vat === null && body.vat_number !== null) errors.push({ path: "vat_number", message: "Must be 1 to 40 characters" });
      if (errors.length > 0) return invalid(errors);

      const addresses = record.addresses;
      if (body.shipping_address !== undefined) addresses.shipping_address = structuredClone(body.shipping_address as Address | null);
      if (body.billing_address !== undefined) addresses.billing_address = structuredClone(body.billing_address as Address | null);
      if (body.vat_number !== undefined) addresses.vat_number = vat ?? null;
      return { ok: true, body: structuredClone(addresses) };
    },

    /** `PUT /customers/{id}/payment-terms`: the terms as a whole; days default to 30 and the limit to none. */
    setTerms(id: string, body: unknown): Answer<Customer["payment_terms"]> {
      const record = customers.get(id);
      if (!record) return CUSTOMER_NOT_FOUND;
      if (!isObject(body)) return invalid([{ path: "", message: "Expected an object" }]);
      const errors = unknownKeys(body, ["terms", "days_to_pay", "credit_limit"]);
      if (body.terms !== "pay_first" && body.terms !== "pay_later") errors.push({ path: "terms", message: 'Expected "pay_first" or "pay_later"' });
      const days = body.days_to_pay ?? 30;
      if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 120) errors.push({ path: "days_to_pay", message: "Must be 1 to 120" });
      const limit = body.credit_limit ?? null;
      if (limit !== null && (typeof limit !== "string" || !AMOUNT.test(limit))) {
        errors.push({ path: "credit_limit", message: "must be an amount of zero or more with at most 2 places, such as 5000.00" });
      }
      if (errors.length > 0) return invalid(errors);

      record.view.payment_terms = {
        terms: body.terms as Customer["payment_terms"]["terms"],
        days_to_pay: days as number,
        credit_limit: limit === null ? null : fromCents(cents(limit as string)),
        currency: CURRENCY,
      };
      return { ok: true, body: structuredClone(record.view.payment_terms) };
    },

    /** `GET /payments/customers/{id}`: the terms, what's billed and not paid, and the open and overdue invoices, oldest due first. */
    money(id: string): Answer<CustomerMoney> {
      const record = customers.get(id);
      if (!record) return CUSTOMER_NOT_FOUND;
      const open: CustomerInvoice[] = [];
      const overdue: CustomerInvoice[] = [];
      for (const order of orders()) {
        const invoice = order.payment.invoice;
        if (order.customer.id !== id || !invoice || invoice.status !== "open") continue;
        const row = { order_id: order.id, order_number: order.number, total: order.total, currency: order.currency, due_on: invoice.due_on, url: invoice.url };
        (order.payment.state === "overdue" ? overdue : open).push(row);
      }
      const byDue = (a: CustomerInvoice, b: CustomerInvoice) => a.due_on.localeCompare(b.due_on);
      const billed = fromCents([...open, ...overdue].reduce((sum, invoice) => sum + cents(invoice.total), 0));
      return {
        ok: true,
        body: {
          ...structuredClone(record.view.payment_terms),
          exposure: billed,
          balance: billed,
          open_invoices: open.sort(byDue),
          overdue_invoices: overdue.sort(byDue),
        },
      };
    },

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
