"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { Customer, CustomerAddresses } from "@/lib/api/schema-types";
import {
  addressesBody,
  addressesProblems,
  addressesValues,
  customerBody,
  customerProblems,
  customerValues,
  hasAddressesProblems,
  termsBody,
  termsProblems,
  termsValues,
} from "@/lib/customers/form";
import { useCustomerAddressBook, useCustomerGroups, useSetAddresses, useSetTerms, useUpdateCustomer } from "@/lib/customers/queries";
import type { AddressField } from "@/lib/new-order/form";

import { EditDialog } from "./edit-dialog";
import { AddressesFields, type AddressesErrors } from "./form/addresses-fields";
import { CustomerFields, type CustomerErrors } from "./form/customer-fields";
import { TermsFields, type TermsErrors } from "./form/terms-fields";
import { saveErrors } from "./save-errors";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** An Edit button that opens its dialog fresh each time, so it starts from what's saved now. */
function EditButton({
  label,
  name,
  disabled = false,
  prominent = false,
  render,
}: {
  label: string;
  name: string;
  disabled?: boolean;
  /** The header's Edit is a full button; a panel's sits quietly in its title bar. */
  prominent?: boolean;
  render: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  // Radix gives focus back only to a `DialogTrigger`; this dialog is opened by state, so the button takes it back itself.
  useEffect(() => {
    if (open) opened.current = true;
    else if (opened.current) button.current?.focus();
  }, [open]);

  return (
    <>
      <Button
        ref={button}
        variant={prominent ? "secondary" : "ghost"}
        className={prominent ? undefined : "h-9 px-3 font-medium text-ink pointer-coarse:h-11"}
        aria-label={name}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && render(() => setOpen(false))}
    </>
  );
}

/** The header's Edit: name, group and the workshop pick, saved with one `PATCH /customers/{id}`. */
export function EditCustomerButton({ customer }: { customer: Customer }) {
  return <EditButton label="Edit" name="Edit customer" prominent render={(close) => <EditCustomerDialog customer={customer} onClose={close} />} />;
}

const CUSTOMER_PATHS: Record<string, keyof CustomerErrors> = { name: "name", customer_group_id: "groupId", may_pick_partner: "mayPickPartner" };

function EditCustomerDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const groups = useCustomerGroups();
  const update = useUpdateCustomer(customer.id);
  const [before] = useState(() => customerValues(customer));
  const [values, setValues] = useState(before);
  const [tried, setTried] = useState(false);
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setTried(true);
    if (Object.keys(customerProblems(values)).length > 0) return;
    const body = customerBody(before, values);
    if (Object.keys(body).length === 0) return onClose();
    setErrors({});
    setMessage(null);
    try {
      await update.mutateAsync(body);
      onClose();
    } catch (error) {
      const refused = saveErrors(error, (path) => CUSTOMER_PATHS[path] ?? null);
      setErrors(refused.fields as CustomerErrors);
      setMessage(refused.message);
    }
  }

  return (
    <EditDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Edit customer"
      description={customer.name}
      dirty={!same(before, values)}
      saving={update.isPending}
      message={message}
      onSave={() => void save()}
    >
      <CustomerFields value={values} onChange={setValues} errors={errors} groups={groups.data ?? null} showProblems={tried} />
    </EditDialog>
  );
}

/** Details' Edit: the shipping address, "Bill to the shipping address" and the VAT number, saved with one `PUT …/addresses`. */
export function EditDetailsButton({ customer }: { customer: Customer }) {
  const book = useCustomerAddressBook(customer.id);
  return (
    <EditButton
      label="Edit"
      name="Edit details"
      disabled={!book.data}
      render={(close) => book.data && <EditDetailsDialog customer={customer} saved={book.data} onClose={close} />}
    />
  );
}

/** erp-api's `shipping_address.city` as the form's shipping city, `vat_number` as its VAT. */
function addressesPath(path: string): string | null {
  if (path === "vat_number") return "vat";
  const [address, field] = path.split(".");
  if (address === "shipping_address" && field) return `shipping.${field}`;
  if (address === "billing_address" && field) return `billing.${field}`;
  return null;
}

function toAddressesErrors(fields: Record<string, string>): AddressesErrors {
  const errors: AddressesErrors = {};
  for (const [key, message] of Object.entries(fields)) {
    if (key === "vat") errors.vat = message;
    const [side, field] = key.split(".") as ["shipping" | "billing", AddressField];
    if ((side === "shipping" || side === "billing") && field) errors[side] = { ...errors[side], [field]: message };
  }
  return errors;
}

function EditDetailsDialog({ customer, saved, onClose }: { customer: Customer; saved: CustomerAddresses; onClose: () => void }) {
  const set = useSetAddresses(customer.id);
  const [before] = useState(() => addressesValues(saved));
  const [values, setValues] = useState(before);
  const [tried, setTried] = useState(false);
  const [errors, setErrors] = useState<AddressesErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setTried(true);
    if (hasAddressesProblems(addressesProblems(values))) return;
    const body = addressesBody(before, values);
    if (Object.keys(body).length === 0) return onClose();
    setErrors({});
    setMessage(null);
    try {
      await set.mutateAsync(body);
      onClose();
    } catch (error) {
      const refused = saveErrors(error, addressesPath);
      setErrors(toAddressesErrors(refused.fields));
      setMessage(refused.message);
    }
  }

  return (
    <EditDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Edit details"
      description={`${customer.name} · addresses and VAT number`}
      dirty={!same(before, values)}
      saving={set.isPending}
      message={message}
      onSave={() => void save()}
    >
      <AddressesFields value={values} onChange={setValues} errors={errors} showProblems={tried} />
    </EditDialog>
  );
}

/** Money's Edit terms: the terms as a whole, with `PUT …/payment-terms`. Staff with `payment.write` only. */
export function EditTermsButton({ customer }: { customer: Customer }) {
  return <EditButton label="Edit terms" name="Edit terms" render={(close) => <EditTermsDialog customer={customer} onClose={close} />} />;
}

const TERMS_PATHS: Record<string, keyof TermsErrors> = { terms: "terms", days_to_pay: "daysToPay", credit_limit: "creditLimit" };

function EditTermsDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const set = useSetTerms(customer.id);
  const [before] = useState(() => termsValues(customer.payment_terms));
  const [values, setValues] = useState(before);
  const [tried, setTried] = useState(false);
  const [errors, setErrors] = useState<TermsErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setTried(true);
    if (Object.keys(termsProblems(values)).length > 0) return;
    if (same(termsBody(before), termsBody(values))) return onClose();
    setErrors({});
    setMessage(null);
    try {
      await set.mutateAsync(termsBody(values));
      onClose();
    } catch (error) {
      const refused = saveErrors(error, (path) => TERMS_PATHS[path] ?? null);
      setErrors(refused.fields as TermsErrors);
      setMessage(refused.message);
    }
  }

  return (
    <EditDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Edit payment terms"
      description={`${customer.name}. New orders follow these terms; placed orders keep theirs.`}
      dirty={!same(before, values)}
      saving={set.isPending}
      message={message}
      onSave={() => void save()}
    >
      <TermsFields value={values} onChange={setValues} currency={customer.payment_terms.currency} errors={errors} showProblems={tried} />
    </EditDialog>
  );
}
