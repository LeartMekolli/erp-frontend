import { describe, expect, it } from "vitest";

import type { Address, CatalogProduct, Customer, CustomerAddresses, SpeedChoice } from "../../src/lib/api/schema-types";

import { CAST_RING_ID, DRAFT_PRODUCT_ID, GIFT_SET_ID, LUNA_LOGO_ID, NAMEPLATE_ID, TRADE_GROUP_ID } from "./catalog";
import type { Answer, Page } from "./orders";
import { CUSTOMERS } from "./orders-seed";
import { search } from "./search";
import { FAKE_API_URL, FAKE_PASSWORD, LUNA_ID, MIRA_ID, ORDER_TAKER, STAFF, WORKSPACE, type FakeUser } from "./seed";
import { fakeState } from "./state";

async function get(user: FakeUser, path: string) {
  const login = await fetch(`${FAKE_API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: WORKSPACE, email: user.email, password: FAKE_PASSWORD }),
  });
  const { access_token } = (await login.json()) as { access_token: string };
  return fetch(`${FAKE_API_URL}${path}`, { headers: { authorization: `Bearer ${access_token}` } });
}

async function productIds(customerId: string): Promise<string[]> {
  const res = await get(ORDER_TAKER, `/catalog/products?customer_id=${customerId}&limit=200`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { data: CatalogProduct[]; next_cursor: string | null };
  expect(body.next_cursor).toBeNull();
  return body.data.map((product) => product.id);
}

describe("fake erp-api catalog, customers and speeds", () => {
  it("lists only what Luna can see", async () => {
    const ids = await productIds(LUNA_ID);
    expect(ids).toEqual([CAST_RING_ID, NAMEPLATE_ID, GIFT_SET_ID, LUNA_LOGO_ID]);
    expect(ids).not.toContain(DRAFT_PRODUCT_ID);
  });

  it("hides Luna's own product from Mira", async () => {
    const ids = await productIds(MIRA_ID);
    expect(ids).toEqual([CAST_RING_ID, NAMEPLATE_ID, GIFT_SET_ID]);
  });

  it("answers 404 for an unknown customer", async () => {
    const res = await get(ORDER_TAKER, "/catalog/products?customer_id=9a9a9a9a-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ detail: "Customer not found" });
  });

  it("offers Mira only her plan's speeds", async () => {
    const res = await get(ORDER_TAKER, `/pricing/quotes/delivery-speeds?customer_id=${MIRA_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SpeedChoice[] };
    expect(body.data.map((speed) => speed.key)).toEqual(["standard"]);
  });

  it("has no saved address for Mira", async () => {
    const res = await get(ORDER_TAKER, `/customers/${MIRA_ID}/addresses`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CustomerAddresses;
    expect(body.shipping_address).toBeNull();
    expect(body.billing_address).toBeNull();
  });
});

const ALL_NAMES = [
  "Brightline Optics",
  "Northside Architecture Models and Protos",
  "Pinewood Instruments",
  "Halden Audio",
  "Kestrel Labs",
  "Mira Studio",
  "Orbit Dental",
  "Luna Jewels",
  "Old Works",
  "Fieldnote Studio",
];

const LYON: Address = { name: "Luna Jewels", line1: "12 rue des Orfèvres", city: "Lyon", postal_code: "69002", country: "FR", phone: "+33 4 72 00 00 00" };

function list(query: Record<string, string> = {}) {
  return fakeState().catalog.list(new URLSearchParams(query));
}

function names(answer: Answer<Page<Customer>>): string[] {
  if (!answer.ok) throw new Error(`refused: ${answer.status}`);
  return answer.body.data.map((customer) => customer.name);
}

function refusedPaths(answer: Answer<unknown>): string[] {
  if (answer.ok || answer.status !== 400) throw new Error("expected a 400");
  return answer.errors.map((error) => error.path);
}

describe("fake erp-api customer list", () => {
  it("lists every customer newest first, 50 a page", () => {
    const answer = list();
    expect(names(answer)).toEqual(ALL_NAMES);
    expect(answer.ok && answer.body.next_cursor).toBeNull();
  });

  it("pages by cursor", () => {
    const first = list({ limit: "2" });
    expect(names(first)).toEqual(ALL_NAMES.slice(0, 2));
    const cursor = first.ok ? first.body.next_cursor : null;
    expect(cursor).not.toBeNull();
    expect(names(list({ limit: "2", cursor: cursor! }))).toEqual(ALL_NAMES.slice(2, 4));
  });

  it("searches any part of the name in any case", () => {
    expect(names(list({ q: "lun" }))).toEqual(["Luna Jewels"]);
    expect(names(list({ q: "  STUDIO " }))).toEqual(["Mira Studio", "Fieldnote Studio"]);
  });

  it("refuses a search over 100 characters or of spaces only", () => {
    expect(refusedPaths(list({ q: "x".repeat(101) }))).toEqual(["q"]);
    expect(refusedPaths(list({ q: "   " }))).toEqual(["q"]);
  });

  it("matches the whole name in any case, never a part of it", () => {
    expect(names(list({ name: " luna JEWELS " }))).toEqual(["Luna Jewels"]);
    expect(names(list({ name: "Luna" }))).toEqual([]);
    expect(names(list({ name: "Luna Jewels Atelier" }))).toEqual([]);
  });

  it("keeps accents apart and takes % and _ as they are", () => {
    fakeState().catalog.create({ name: "Café Nord" }, null, "staff-1");
    expect(names(list({ name: "Cafe Nord" }))).toEqual([]);
    expect(names(list({ name: "CAFÉ NORD" }))).toEqual(["Café Nord"]);
    expect(names(list({ name: "Caf% Nord" }))).toEqual([]);
    expect(names(list({ name: "Caf_ Nord" }))).toEqual([]);
  });

  it("finds an older exact match past newer partial ones, with a limit of 1", () => {
    fakeState().catalog.create({ name: "Luna Jewels Atelier" }, null, "staff-1");
    fakeState().catalog.create({ name: "Luna Jewels Studio" }, null, "staff-1");
    expect(names(list({ name: "Luna Jewels", limit: "1" }))).toEqual(["Luna Jewels"]);
  });

  it("matches the whole name together with the other filters", () => {
    expect(names(list({ name: "Old Works", status: "disabled" }))).toEqual(["Old Works"]);
    expect(names(list({ name: "Old Works", status: "active" }))).toEqual([]);
    expect(names(list({ name: "Luna Jewels", customer_group: TRADE_GROUP_ID }))).toEqual(["Luna Jewels"]);
  });

  it("refuses a whole name over 200 characters or of spaces only", () => {
    expect(refusedPaths(list({ name: "x".repeat(201) }))).toEqual(["name"]);
    expect(refusedPaths(list({ name: "   " }))).toEqual(["name"]);
    expect(names(list({ name: "x".repeat(200) }))).toEqual([]);
  });

  it("narrows by status, group and band", () => {
    expect(names(list({ status: "disabled" }))).toEqual(["Old Works"]);
    expect(names(list({ status: "active" }))).not.toContain("Old Works");
    expect(names(list({ customer_group: "none" }))).not.toContain("Luna Jewels");
    expect(names(list({ customer_group: TRADE_GROUP_ID }))).toEqual(["Luna Jewels"]);
    expect(names(list({ band: "standard" }))).toEqual(ALL_NAMES.filter((name) => name !== "Mira Studio"));
    expect(names(list({ band: "gold" }))).toEqual(["Mira Studio"]);
  });

  it("refuses an unknown group, band or status", () => {
    expect(refusedPaths(list({ customer_group: "9a9a9a9a-0000-4000-8000-000000000000" }))).toEqual(["customer_group"]);
    expect(refusedPaths(list({ customer_group: "trade" }))).toEqual(["customer_group"]);
    expect(refusedPaths(list({ band: "platinum" }))).toEqual(["band"]);
    expect(refusedPaths(list({ status: "gone" }))).toEqual(["status"]);
  });

  it("ignores a key it doesn't know, as erp-api's query schema drops it", () => {
    expect(names(list({ sort: "name" }))).toEqual(ALL_NAMES);
  });

  it("lists the group and band choices, the default band first", () => {
    const groups = fakeState().catalog.groups();
    expect(groups.ok && groups.body.data).toEqual([{ id: TRADE_GROUP_ID, key: "trade", name: "Trade" }]);
    const bands = fakeState().catalog.bands();
    expect(bands.ok && bands.body.data[0]).toEqual({ key: "standard", name: "Standard", default: true });
  });
});

describe("fake erp-api customer changes", () => {
  it("changes only the fields sent", () => {
    const answer = fakeState().catalog.update(LUNA_ID, { name: "Luna Atelier" });
    expect(answer.ok && answer.body).toMatchObject({ name: "Luna Atelier", may_pick_partner: true, customer_group: { key: "trade" } });
    const read = fakeState().catalog.customer(LUNA_ID);
    expect(read.ok && read.body.name).toBe("Luna Atelier");
  });

  it("removes the group with null and refuses a 201-character name", () => {
    const removed = fakeState().catalog.update(LUNA_ID, { customer_group_id: null });
    expect(removed.ok && removed.body.customer_group).toBeNull();
    expect(refusedPaths(fakeState().catalog.update(LUNA_ID, { name: "x".repeat(201) }))).toEqual(["name"]);
  });

  it("disables a customer, who then lists only under disabled", () => {
    fakeState().catalog.update(MIRA_ID, { status: "disabled" });
    expect(names(list({ status: "disabled" }))).toEqual(["Mira Studio", "Old Works"]);
  });

  it("keeps both addresses when only the VAT number is sent, and clears one with null", () => {
    const vat = fakeState().catalog.setAddresses(LUNA_ID, { vat_number: "FR99999999999" });
    expect(vat.ok && vat.body).toEqual({ shipping_address: LYON, billing_address: null, vat_number: "FR99999999999" });

    const billing = { ...LYON, name: "Luna Jewels SAS", city: "Paris", postal_code: "75001" };
    fakeState().catalog.setAddresses(LUNA_ID, { billing_address: billing });
    const cleared = fakeState().catalog.setAddresses(LUNA_ID, { billing_address: null });
    expect(cleared.ok && cleared.body).toEqual({ shipping_address: LYON, billing_address: null, vat_number: "FR99999999999" });
  });

  it("refuses a bad address field, an empty VAT number and an unknown key", () => {
    expect(refusedPaths(fakeState().catalog.setAddresses(LUNA_ID, { shipping_address: { ...LYON, country: "fr" } }))).toEqual(["shipping_address.country"]);
    expect(refusedPaths(fakeState().catalog.setAddresses(LUNA_ID, { vat_number: "  " }))).toEqual(["vat_number"]);
    expect(refusedPaths(fakeState().catalog.setAddresses(LUNA_ID, { notes: "x" }))).toEqual(["notes"]);
  });

  it("replaces the terms as a whole, with 30 days and no limit by default", () => {
    const answer = fakeState().catalog.setTerms(MIRA_ID, { terms: "pay_first" });
    expect(answer.ok && answer.body).toEqual({ terms: "pay_first", days_to_pay: 30, credit_limit: null, currency: "EUR" });
    const read = fakeState().catalog.customer(MIRA_ID);
    expect(read.ok && read.body.payment_terms).toEqual({ terms: "pay_first", days_to_pay: 30, credit_limit: null, currency: "EUR" });
    const later = fakeState().catalog.setTerms(MIRA_ID, { terms: "pay_later", days_to_pay: 45, credit_limit: "5000.5" });
    expect(later.ok && later.body).toEqual({ terms: "pay_later", days_to_pay: 45, credit_limit: "5000.50", currency: "EUR" });
  });

  it("refuses a credit limit with a comma and days outside 1 to 120", () => {
    expect(refusedPaths(fakeState().catalog.setTerms(MIRA_ID, { terms: "pay_later", credit_limit: "5,000.00" }))).toEqual(["credit_limit"]);
    expect(refusedPaths(fakeState().catalog.setTerms(MIRA_ID, { terms: "pay_later", days_to_pay: 0 }))).toEqual(["days_to_pay"]);
    expect(refusedPaths(fakeState().catalog.setTerms(MIRA_ID, { terms: "pay_later", days_to_pay: 121 }))).toEqual(["days_to_pay"]);
  });

  it("answers 404 for a change to an unknown customer", () => {
    const unknown = "9a9a9a9a-0000-4000-8000-000000000000";
    expect(fakeState().catalog.update(unknown, { name: "X" })).toMatchObject({ ok: false, status: 404 });
    expect(fakeState().catalog.setAddresses(unknown, {})).toMatchObject({ ok: false, status: 404 });
    expect(fakeState().catalog.setTerms(unknown, { terms: "pay_first" })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("creating a customer", () => {
  const FRANCE: Address = { name: "Atelier Nord", line1: "4 rue du Port", city: "Nantes", postal_code: "44000", country: "FR" };
  const UNKNOWN_GROUP = "9a9a9a9a-0000-4000-8000-000000000000";

  it("makes a pay-first customer with its addresses, first in the list", () => {
    const answer = fakeState().catalog.create({ name: " Atelier Nord ", shipping_address: FRANCE, vat_number: "FR11" }, null, "staff-1");
    expect(answer).toMatchObject({ ok: true, body: { name: "Atelier Nord", customer_group: null, may_pick_partner: false, payment_terms: { terms: "pay_first" } } });
    const id = answer.ok ? answer.body.id : "";
    const listed = list();
    expect(listed.ok && listed.body.data[0]?.id).toBe(id);
    const addresses = fakeState().catalog.addresses(id);
    expect(addresses.ok && addresses.body).toEqual({ shipping_address: FRANCE, billing_address: null, vat_number: "FR11" });
    const money = fakeState().catalog.money(id);
    expect(money.ok && money.body).toMatchObject({ terms: "pay_first", exposure: "0.00" });
  });

  it("refuses a blank name, a bad email and an unknown role with their paths", () => {
    const answer = fakeState().catalog.create({ name: "  ", invitation: { email: "nope", role: "boss" } }, null, "staff-1");
    expect(answer).toMatchObject({ ok: false, status: 400 });
    expect(refusedPaths(answer)).toEqual(["name", "invitation.email", "invitation.role"]);
  });

  it("answers 404 for a group that isn't the workspace's", () => {
    expect(fakeState().catalog.create({ name: "Atelier Nord", customer_group_id: UNKNOWN_GROUP }, null, "staff-1")).toMatchObject({ ok: false, status: 404 });
  });

  it("answers 409 on invitation.email for a staff member's email", () => {
    const answer = fakeState().catalog.create({ name: "Atelier Nord", invitation: { email: STAFF.email, role: "owner" } }, null, "staff-1");
    expect(answer).toMatchObject({ ok: false, status: 409 });
    expect(!answer.ok && answer.status === 409 && answer.errors?.[0]?.path).toBe("invitation.email");
    expect(names(list())).not.toContain("Atelier Nord");
  });

  it("keeps the first invitation and the group", () => {
    const answer = fakeState().catalog.create({ name: "Halden Audio", customer_group_id: TRADE_GROUP_ID, invitation: { email: " Anna@Halden.Example.Test ", role: "buyer" } }, null, "staff-1");
    expect(answer.ok && answer.body.customer_group).toMatchObject({ key: "trade" });
    expect(fakeState().catalog.invitations()).toEqual([{ customerId: answer.ok ? answer.body.id : "", email: "anna@halden.example.test", role: "buyer" }]);
  });

  it("replays the same key and input, and refuses the key with other input", () => {
    const before = names(list()).length;
    const first = fakeState().catalog.create({ name: "Atelier Nord" }, "key-1", "staff-1");
    const again = fakeState().catalog.create({ name: "Atelier Nord" }, "key-1", "staff-1");
    expect(first.ok && again.ok && again.body.id).toBe(first.ok ? first.body.id : "");
    expect(names(list()).length).toBe(before + 1);
    expect(fakeState().catalog.create({ name: "Halden Audio" }, "key-1", "staff-1")).toMatchObject({ ok: false, status: 409, code: "idempotency_key_reused" });
  });

  it("finds a new customer in the search", () => {
    fakeState().catalog.create({ name: "Atelier Nord" }, null, "staff-1");
    const found = search(STAFF, "atelier", [], fakeState().catalog.names());
    expect(found.customers.map((customer) => customer.name)).toEqual(["Atelier Nord"]);
  });

  it("answers invitation null without one, and the invitation with its email queued with one", () => {
    const none = fakeState().catalog.create({ name: "Atelier Nord" }, null, "staff-1");
    expect(none.ok && none.body.invitation).toBeNull();
    const before = Date.now();
    const some = fakeState().catalog.create({ name: "Halden Audio", invitation: { email: "anna@halden.example.test", role: "buyer" } }, null, "staff-1");
    expect(some.ok && some.body.invitation).toMatchObject({ email: "anna@halden.example.test", role: "buyer", email_status: "queued" });
    const expires = some.ok && some.body.invitation ? Date.parse(some.body.invitation.expires_at) : 0;
    expect(expires).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
  });

  it("says the email wasn't sent once the workspace is set to have no customer site", () => {
    fakeState().catalog.setInvitationEmail("no_customer_site");
    const answer = fakeState().catalog.create({ name: "Atelier Nord", invitation: { email: "sofia@atelier.example", role: "owner" } }, null, "staff-1");
    expect(answer.ok && answer.body.invitation?.email_status).toBe("no_customer_site");
  });

  it("replays the whole answer, invitation included", () => {
    const body = { name: "Atelier Nord", invitation: { email: "sofia@atelier.example", role: "owner" } };
    const first = fakeState().catalog.create(body, "key-2", "staff-1");
    const again = fakeState().catalog.create(body, "key-2", "staff-1");
    expect(again.ok && again.body).toEqual(first.ok && first.body);
    expect(fakeState().catalog.invitations()).toHaveLength(1);
  });
});

describe("inviting someone to a customer", () => {
  const SOFIA = { email: "sofia@atelier.example", role: "owner" };

  it("replaces the invitation to the same email and answers what became of its email", () => {
    const created = fakeState().catalog.create({ name: "Atelier Nord", invitation: SOFIA }, null, "staff-1");
    const id = created.ok ? created.body.id : "";
    fakeState().catalog.setInvitationEmail("failed");
    const again = fakeState().catalog.invite(id, { email: " Sofia@Atelier.Example ", role: "admin" }, null, "staff-1");
    expect(again).toMatchObject({ ok: true, body: { email: "sofia@atelier.example", role: "admin", email_status: "failed" } });
    expect(fakeState().catalog.invitations()).toEqual([{ customerId: id, email: "sofia@atelier.example", role: "admin" }]);
  });

  it("replays the same key and input", () => {
    const first = fakeState().catalog.invite(LUNA_ID, SOFIA, "key-3", "staff-1");
    const again = fakeState().catalog.invite(LUNA_ID, SOFIA, "key-3", "staff-1");
    expect(again.ok && again.body).toEqual(first.ok && first.body);
    expect(fakeState().catalog.invite(LUNA_ID, { ...SOFIA, role: "buyer" }, "key-3", "staff-1")).toMatchObject({ ok: false, status: 409, code: "idempotency_key_reused" });
  });

  it("answers 404 for a customer that doesn't exist", () => {
    expect(fakeState().catalog.invite("9a9a9a9a-0000-4000-8000-000000000001", SOFIA, null, "staff-1")).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a bad email and an unknown role with their paths", () => {
    expect(refusedPaths(fakeState().catalog.invite(LUNA_ID, { email: "nope", role: "boss" }, null, "staff-1"))).toEqual(["email", "role"]);
  });

  it("answers 409 on email for a staff member's email", () => {
    const answer = fakeState().catalog.invite(LUNA_ID, { email: STAFF.email, role: "owner" }, null, "staff-1");
    expect(answer).toMatchObject({ ok: false, status: 409 });
    expect(!answer.ok && answer.status === 409 && answer.errors?.[0]?.path).toBe("email");
    expect(fakeState().catalog.invitations()).toEqual([]);
  });
});

describe("fake erp-api customer money", () => {
  it("reads Pinewood's overdue invoice from its order", () => {
    const order = fakeState().orders.all().find((candidate) => candidate.number === 1047)!;
    const answer = fakeState().catalog.money(CUSTOMERS.pinewood.id);
    expect(answer.ok && answer.body).toEqual({
      terms: "pay_later",
      days_to_pay: 30,
      credit_limit: null,
      currency: "EUR",
      exposure: "295.20",
      balance: "295.20",
      open_invoices: [],
      overdue_invoices: [{ order_id: order.id, order_number: 1047, total: "295.20", currency: "EUR", due_on: order.payment.invoice!.due_on, url: order.payment.invoice!.url }],
    });
  });

  it("reads Orbit's open invoice, and nothing owed for Mira", () => {
    const orbit = fakeState().catalog.money(CUSTOMERS.orbit.id);
    expect(orbit.ok && orbit.body.open_invoices.map((invoice) => invoice.order_number)).toEqual([1043]);
    expect(orbit.ok && orbit.body.overdue_invoices).toEqual([]);
    const mira = fakeState().catalog.money(MIRA_ID);
    expect(mira.ok && mira.body).toMatchObject({ terms: "pay_later", credit_limit: "5000.00", exposure: "0.00", open_invoices: [], overdue_invoices: [] });
  });

  it("answers 404 for an unknown customer", () => {
    expect(fakeState().catalog.money("9a9a9a9a-0000-4000-8000-000000000000")).toMatchObject({ ok: false, status: 404 });
  });
});
