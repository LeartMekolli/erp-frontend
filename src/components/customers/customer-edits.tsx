"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FormProvider } from "react-hook-form";

import { Button } from "@/components/ui/button";
import type { Customer, CustomerAddresses } from "@/lib/api/schema-types";
import {
  addressesBody,
  addressesValues,
  customerBody,
  customerValues,
  termsBody,
  termsValues,
  type AddressesValues,
  type CustomerValues,
  type TermsValues,
} from "@/lib/customers/form";
import { useCustomerAddressBook, useCustomerGroups, useSetAddresses, useSetTerms, useUpdateCustomer } from "@/lib/customers/queries";

import { EditDialog } from "./edit-dialog";
import { AddressesFields } from "./form/addresses-fields";
import { CustomerFields } from "./form/customer-fields";
import { useAddressesForm, useCustomerForm, useTermsForm } from "./form/section-forms";
import { TermsFields } from "./form/terms-fields";
import { addressesPath, applySaveErrors } from "./save-errors";

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

const CUSTOMER_PATHS: Record<string, keyof CustomerValues> = { name: "name", customer_group_id: "groupId", may_pick_partner: "mayPickPartner" };

function EditCustomerDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const groups = useCustomerGroups();
  const update = useUpdateCustomer(customer.id);
  const [before] = useState(() => customerValues(customer));
  const form = useCustomerForm(before);
  const [message, setMessage] = useState<string | null>(null);

  async function save(values: CustomerValues) {
    const body = customerBody(before, values);
    if (Object.keys(body).length === 0) return onClose();
    setMessage(null);
    try {
      await update.mutateAsync(body);
      onClose();
    } catch (error) {
      // Without the groups there's no group picker, so a refused group is said above the form.
      const toField = (path: string) => (path === "customer_group_id" && !groups.data ? null : (CUSTOMER_PATHS[path] ?? null));
      setMessage(applySaveErrors(error, toField, form.setError));
    }
  }

  return (
    <EditDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Edit customer"
      description={customer.name}
      dirty={form.formState.isDirty}
      saving={update.isPending}
      message={message}
      onSave={() => void form.handleSubmit(save)()}
    >
      <FormProvider {...form}>
        <CustomerFields groups={groups.data ?? null} />
      </FormProvider>
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

function EditDetailsDialog({ customer, saved, onClose }: { customer: Customer; saved: CustomerAddresses; onClose: () => void }) {
  const set = useSetAddresses(customer.id);
  const [before] = useState(() => addressesValues(saved));
  const form = useAddressesForm(before);
  const [message, setMessage] = useState<string | null>(null);

  async function save(values: AddressesValues) {
    const body = addressesBody(before, values);
    if (Object.keys(body).length === 0) return onClose();
    setMessage(null);
    try {
      await set.mutateAsync(body);
      onClose();
    } catch (error) {
      setMessage(applySaveErrors(error, (path) => addressesPath(path, values), form.setError));
    }
  }

  return (
    <EditDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Edit details"
      description={`${customer.name} · addresses and VAT number`}
      dirty={form.formState.isDirty}
      saving={set.isPending}
      message={message}
      onSave={() => void form.handleSubmit(save)()}
    >
      <FormProvider {...form}>
        <AddressesFields />
      </FormProvider>
    </EditDialog>
  );
}

/** Money's Edit terms: the terms as a whole, with `PUT …/payment-terms`. Staff with `payment.write` only. */
export function EditTermsButton({ customer }: { customer: Customer }) {
  return <EditButton label="Edit terms" name="Edit terms" render={(close) => <EditTermsDialog customer={customer} onClose={close} />} />;
}

const TERMS_PATHS: Record<string, keyof TermsValues> = { terms: "terms", days_to_pay: "daysToPay", credit_limit: "creditLimit" };

function EditTermsDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const set = useSetTerms(customer.id);
  const [before] = useState(() => termsValues(customer.payment_terms));
  const form = useTermsForm(before);
  const [message, setMessage] = useState<string | null>(null);

  async function save(values: TermsValues) {
    if (same(termsBody(before), termsBody(values))) return onClose();
    setMessage(null);
    try {
      await set.mutateAsync(termsBody(values));
      onClose();
    } catch (error) {
      // Pay first hides the days and the limit, so their errors are said above the form.
      const toField = (path: string) => {
        const field = TERMS_PATHS[path] ?? null;
        return field !== "terms" && values.terms === "pay_first" ? null : field;
      };
      setMessage(applySaveErrors(error, toField, form.setError));
    }
  }

  return (
    <EditDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Edit payment terms"
      description={`${customer.name}. New orders follow these terms; placed orders keep theirs.`}
      dirty={form.formState.isDirty}
      saving={set.isPending}
      message={message}
      onSave={() => void form.handleSubmit(save)()}
    >
      <FormProvider {...form}>
        <TermsFields currency={customer.payment_terms.currency} />
      </FormProvider>
    </EditDialog>
  );
}
