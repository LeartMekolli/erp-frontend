/**
 * The customer form's values and what each section sends. Every `*Body` compares what the form
 * opened with to what it holds now and sends only what changed, so saving one section never
 * clears another's fields.
 */

import type { Address, AddressesUpdate, Customer, CustomerAddresses, CustomerUpdate, PaymentTermsBody } from "@/lib/api/schema-types";
import { type AddressField, type AddressProblem, ADDRESS_FIELDS, addressProblems, EMPTY_ADDRESS, orderAddress } from "@/lib/new-order/form";

/** The Customer section: what `PATCH /customers/{id}` changes, apart from the status. */
export interface CustomerValues {
  name: string;
  /** A group's id, or null for no group. */
  groupId: string | null;
  mayPickPartner: boolean;
}

/** The Shipping address and Invoices sections: what `PUT /customers/{id}/addresses` changes. Blank addresses are all "". */
export interface AddressesValues {
  shipping: Address;
  /** Ticked: invoices go to the shipping address, and erp-api keeps no billing address. */
  billToShipping: boolean;
  billing: Address;
  vat: string;
}

/** The Payment terms section, as typed. */
export interface TermsValues {
  terms: "pay_first" | "pay_later";
  daysToPay: string;
  creditLimit: string;
}

/** erp-api's longest name and VAT number (`customers.service.ts:33`, `addresses.ts:12`). */
export const NAME_LIMIT = 200;
export const VAT_LIMIT = 40;

/** erp-api's credit limit (`payment-response.ts:44-47`): digits, then at most 2 places. */
const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;

export function customerValues(customer: Customer): CustomerValues {
  return { name: customer.name, groupId: customer.customer_group?.id ?? null, mayPickPartner: customer.may_pick_partner };
}

/** What's wrong with the Customer section; fields that are fine are left out. */
export function customerProblems(values: CustomerValues): Partial<Record<"name", string>> {
  const name = values.name.trim();
  if (name === "") return { name: "Enter a name" };
  if (name.length > NAME_LIMIT) return { name: `Use ${NAME_LIMIT} characters or fewer` };
  return {};
}

/** Only the Customer fields that changed; a removed group is `customer_group_id: null`. */
export function customerBody(before: CustomerValues, after: CustomerValues): CustomerUpdate {
  const body: CustomerUpdate = {};
  const name = after.name.trim();
  if (name !== before.name.trim()) body.name = name;
  if (after.groupId !== before.groupId) body.customer_group_id = after.groupId;
  if (after.mayPickPartner !== before.mayPickPartner) body.may_pick_partner = after.mayPickPartner;
  return body;
}

/** A saved address as the form edits it, every field a string. */
const draft = (address: Address | null): Address => ({ ...EMPTY_ADDRESS, ...address });

const isBlank = (address: Address) => ADDRESS_FIELDS.every((field) => (address[field] ?? "").trim() === "");

export function addressesValues(addresses: CustomerAddresses): AddressesValues {
  return {
    shipping: draft(addresses.shipping_address),
    billToShipping: addresses.billing_address === null,
    billing: draft(addresses.billing_address),
    vat: addresses.vat_number ?? "",
  };
}

export interface AddressesProblems {
  shipping: Partial<Record<AddressField, AddressProblem>>;
  billing: Partial<Record<AddressField, AddressProblem>>;
  vat?: string;
}

/** What's wrong with the addresses: a blank shipping address is allowed (none saved), a half-typed one isn't; billing counts only when unticked. */
export function addressesProblems(values: AddressesValues): AddressesProblems {
  const problems: AddressesProblems = {
    shipping: isBlank(values.shipping) ? {} : addressProblems(values.shipping),
    billing: values.billToShipping ? {} : addressProblems(values.billing),
  };
  if (values.vat.trim().length > VAT_LIMIT) problems.vat = `Use ${VAT_LIMIT} characters or fewer`;
  return problems;
}

/** An address as erp-api takes it, or null for none. Throws on an address `addressesProblems` would refuse. */
function sent(address: Address): Address | null {
  if (isBlank(address)) return null;
  const value = orderAddress(address);
  if (value === null) throw new Error("Check the address with addressesProblems before sending it");
  return value;
}

const same = (a: Address | null, b: Address | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Only the address fields that changed. Ticking "Bill to the shipping address" sends
 * `billing_address: null`; clearing the VAT number sends `vat_number: null`.
 */
export function addressesBody(before: AddressesValues, after: AddressesValues): AddressesUpdate {
  const body: AddressesUpdate = {};
  const shipping = sent(after.shipping);
  if (!same(sent(before.shipping), shipping)) body.shipping_address = shipping;
  const billingOf = (values: AddressesValues) => (values.billToShipping ? null : sent(values.billing));
  const billing = billingOf(after);
  if (!same(billingOf(before), billing)) body.billing_address = billing;
  const vat = after.vat.trim() || null;
  if (vat !== (before.vat.trim() || null)) body.vat_number = vat;
  return body;
}

export function termsValues(terms: Customer["payment_terms"]): TermsValues {
  return { terms: terms.terms, daysToPay: String(terms.days_to_pay), creditLimit: terms.credit_limit ?? "" };
}

/** What's wrong with the terms; pay first checks nothing, since it sends only the terms. */
export function termsProblems(values: TermsValues): Partial<Record<"daysToPay" | "creditLimit", string>> {
  if (values.terms === "pay_first") return {};
  const problems: Partial<Record<"daysToPay" | "creditLimit", string>> = {};
  const days = values.daysToPay.trim();
  if (!/^\d{1,3}$/.test(days) || Number(days) < 1 || Number(days) > 120) problems.daysToPay = "Enter 1 to 120 days";
  const limit = values.creditLimit.trim();
  if (limit !== "" && !AMOUNT.test(limit)) problems.creditLimit = "Enter an amount such as 5000.00";
  return problems;
}

/** The terms as a whole, as erp-api replaces them: pay first sends only the terms; an empty limit is no limit. */
export function termsBody(values: TermsValues): PaymentTermsBody {
  if (values.terms === "pay_first") return { terms: "pay_first" };
  const limit = values.creditLimit.trim();
  return { terms: "pay_later", days_to_pay: Number(values.daysToPay.trim()), credit_limit: limit === "" ? null : limit };
}
