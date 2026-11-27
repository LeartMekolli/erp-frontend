import { describe, expect, it } from "vitest";

import type { Address, Customer, CustomerAddresses } from "@/lib/api/schema-types";
import { EMPTY_ADDRESS } from "@/lib/new-order/form";

import {
  addressesBody,
  addressesProblems,
  addressesValues,
  customerBody,
  customerProblems,
  customerValues,
  EMPTY_NEW_CUSTOMER,
  newCustomerBody,
  personProblems,
  termsBody,
  termsProblems,
  termsValues,
} from "./form";

const TRADE = { id: "a4a4a4a4-0000-4000-8000-000000000010", key: "trade", name: "Trade" };

const LUNA: Customer = {
  id: "c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e30",
  name: "Luna Jewels",
  status: "active",
  customer_group: TRADE,
  member_count: 1,
  may_pick_partner: true,
  payment_terms: { terms: "pay_first", days_to_pay: 30, credit_limit: null, currency: "EUR" },
  plan: { key: "free", name: "Free" },
  band: { key: "standard", name: "Standard" },
  created_at: "2026-03-12T09:00:00.000Z",
};

const LYON: Address = { name: "Luna Jewels", line1: "12 rue des Orfèvres", city: "Lyon", postal_code: "69002", country: "FR", phone: "+33 4 72 00 00 00" };
const VIENNA: Address = { name: "Luna Jewels GmbH", line1: "Ringstraße 4", city: "Wien", postal_code: "1010", region: "Wien", country: "AT" };

const SAVED: CustomerAddresses = { shipping_address: LYON, billing_address: VIENNA, vat_number: "FR00123456789" };

describe("New customer", () => {
  it("sends only what was filled in, never payment terms", () => {
    expect(newCustomerBody({ ...EMPTY_NEW_CUSTOMER, name: " Atelier Nord " })).toEqual({ name: "Atelier Nord" });

    const body = newCustomerBody({
      ...EMPTY_NEW_CUSTOMER,
      name: "Halden Audio",
      groupId: TRADE.id,
      mayPickPartner: true,
      shipping: { ...EMPTY_ADDRESS, ...LYON },
      billToShipping: false,
      billing: { ...EMPTY_ADDRESS, ...VIENNA },
      vat: " FR11 ",
      email: " Sofia@Halden.Example ",
      role: "owner",
    });
    expect(body).toEqual({
      name: "Halden Audio",
      customer_group_id: TRADE.id,
      may_pick_partner: true,
      shipping_address: LYON,
      billing_address: VIENNA,
      vat_number: "FR11",
      invitation: { email: "sofia@halden.example", role: "owner" },
    });
    expect(body).not.toHaveProperty("payment_terms");
  });

  it("leaves the billing address out while it follows the shipping address", () => {
    const body = newCustomerBody({ ...EMPTY_NEW_CUSTOMER, name: "Halden Audio", billing: { ...EMPTY_ADDRESS, ...VIENNA } });
    expect(body).toEqual({ name: "Halden Audio" });
  });

  it("checks the first person's email only when one is typed", () => {
    const message = "Enter an email such as name@example.com";
    expect(personProblems({ email: "", role: "owner" })).toEqual({});
    expect(personProblems({ email: "  ", role: "owner" })).toEqual({});
    expect(personProblems({ email: "sofia@halden.example", role: "buyer" })).toEqual({});
    expect(personProblems({ email: "sofia", role: "owner" })).toEqual({ email: message });
    expect(personProblems({ email: `${"a".repeat(310)}@halden.example`, role: "owner" })).toEqual({ email: message });
  });
});

describe("the Customer section", () => {
  it("sends only the name when only the name changed", () => {
    const before = customerValues(LUNA);
    expect(customerBody(before, { ...before, name: "  Luna Atelier " })).toEqual({ name: "Luna Atelier" });
  });

  it("sends null to remove the group, and the workshop pick when it changed", () => {
    const before = customerValues(LUNA);
    expect(customerBody(before, { ...before, groupId: null })).toEqual({ customer_group_id: null });
    expect(customerBody(before, { ...before, mayPickPartner: false })).toEqual({ may_pick_partner: false });
    expect(customerBody(before, before)).toEqual({});
  });

  it("needs a name of at most 200 characters", () => {
    const values = customerValues(LUNA);
    expect(customerProblems(values)).toEqual({});
    expect(customerProblems({ ...values, name: "  " })).toEqual({ name: "Enter a name" });
    expect(customerProblems({ ...values, name: "x".repeat(201) })).toEqual({ name: "Use 200 characters or fewer" });
  });
});

describe("the Shipping address and Invoices sections", () => {
  it("opens with the saved addresses, ticked when there's no billing address", () => {
    expect(addressesValues(SAVED)).toMatchObject({ billToShipping: false, vat: "FR00123456789", shipping: { city: "Lyon", line2: "" } });
    expect(addressesValues({ shipping_address: null, billing_address: null, vat_number: null })).toMatchObject({ billToShipping: true, vat: "", shipping: { name: "" } });
  });

  it("sends only the shipping address when only its city changed", () => {
    const before = addressesValues(SAVED);
    const after = { ...before, shipping: { ...before.shipping, city: "Villeurbanne" } };
    expect(addressesBody(before, after)).toEqual({ shipping_address: { ...LYON, city: "Villeurbanne" } });
  });

  it("sends billing_address null when Bill to the shipping address is ticked", () => {
    const before = addressesValues(SAVED);
    expect(addressesBody(before, { ...before, billToShipping: true })).toEqual({ billing_address: null });
  });

  it("sends the billing address when unticked", () => {
    const before = addressesValues({ ...SAVED, billing_address: null });
    const after = { ...before, billToShipping: false, billing: { ...before.billing, ...VIENNA } };
    expect(addressesBody(before, after)).toEqual({ billing_address: VIENNA });
  });

  it("sends vat_number null when the VAT number is cleared, and nothing when nothing changed", () => {
    const before = addressesValues(SAVED);
    expect(addressesBody(before, { ...before, vat: "  " })).toEqual({ vat_number: null });
    expect(addressesBody(before, { ...before, vat: " FR11 " })).toEqual({ vat_number: "FR11" });
    expect(addressesBody(before, before)).toEqual({});
  });

  it("accepts a blank shipping address, but not a half-typed one or a billing one left blank", () => {
    const none = addressesValues({ shipping_address: null, billing_address: null, vat_number: null });
    expect(addressesProblems(none)).toEqual({ shipping: {}, billing: {} });
    const half = { ...none, shipping: { ...none.shipping, city: "Lyon" } };
    expect(addressesProblems(half).shipping).toMatchObject({ name: "missing", line1: "missing" });
    expect(addressesProblems({ ...none, billToShipping: false }).billing).toMatchObject({ name: "missing" });
    expect(addressesProblems({ ...none, vat: "x".repeat(41) }).vat).toBe("Use 40 characters or fewer");
  });
});

describe("the Payment terms section", () => {
  const later = { terms: "pay_later", daysToPay: "30", creditLimit: "" } as const;

  it("opens with the saved terms", () => {
    expect(termsValues({ terms: "pay_later", days_to_pay: 45, credit_limit: "5000.00", currency: "EUR" })).toEqual({ terms: "pay_later", daysToPay: "45", creditLimit: "5000.00" });
    expect(termsValues({ terms: "pay_first", days_to_pay: 30, credit_limit: null, currency: "EUR" })).toEqual({ terms: "pay_first", daysToPay: "30", creditLimit: "" });
  });

  it("accepts the amounts erp-api accepts, and refuses the rest", () => {
    expect(termsProblems({ ...later, creditLimit: "5000" })).toEqual({});
    expect(termsProblems({ ...later, creditLimit: "5000.5" })).toEqual({});
    expect(termsProblems({ ...later, creditLimit: "5,000.00" })).toEqual({ creditLimit: "Enter an amount such as 5000.00" });
    expect(termsProblems({ ...later, creditLimit: "-1" })).toEqual({ creditLimit: "Enter an amount such as 5000.00" });
  });

  it("needs 1 to 120 days", () => {
    expect(termsProblems({ ...later, daysToPay: "0" })).toEqual({ daysToPay: "Enter 1 to 120 days" });
    expect(termsProblems({ ...later, daysToPay: "121" })).toEqual({ daysToPay: "Enter 1 to 120 days" });
    expect(termsProblems({ ...later, daysToPay: "" })).toEqual({ daysToPay: "Enter 1 to 120 days" });
    expect(termsProblems({ ...later, daysToPay: "120" })).toEqual({});
  });

  it("checks nothing for pay first", () => {
    expect(termsProblems({ terms: "pay_first", daysToPay: "0", creditLimit: "5,000" })).toEqual({});
  });

  it("sends only the terms for pay first, and days and limit for pay later", () => {
    expect(termsBody({ terms: "pay_first", daysToPay: "45", creditLimit: "100" })).toEqual({ terms: "pay_first" });
    expect(termsBody(later)).toEqual({ terms: "pay_later", days_to_pay: 30, credit_limit: null });
    expect(termsBody({ ...later, daysToPay: " 45 ", creditLimit: " 5000 " })).toEqual({ terms: "pay_later", days_to_pay: 45, credit_limit: "5000" });
  });
});
