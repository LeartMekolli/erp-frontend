"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FormProvider, useFormState, useWatch, type Path } from "react-hook-form";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import type { CreatedCustomer } from "@/lib/api/schema-types";
import { EMPTY_NEW_CUSTOMER, newCustomerBody, type NewCustomerValues } from "@/lib/customers/form";
import { useCreateCustomer, useCustomerGroups } from "@/lib/customers/queries";

import { InvoicesFields, ShippingFields } from "./form/addresses-fields";
import { CustomerFields } from "./form/customer-fields";
import { PersonFields } from "./form/person-fields";
import { useNewCustomerForm } from "./form/section-forms";
import { NameWarning } from "./name-warning";
import { addressesPath, applySaveErrors } from "./save-errors";

/** What the page's sticky bar and the side panel's footer draw their Create from. */
export interface CreateState {
  creating: boolean;
  create: () => void;
}

/**
 * The Create button both owners put in their footer, with its words while it runs. `footer` is drawn
 * inside the form, so it submits it, and Enter in a field does the same.
 */
export function CreateCustomerButton({ creating, className }: CreateState & { className?: string }) {
  return (
    <Button type="submit" className={className} disabled={creating} aria-busy={creating || undefined}>
      {creating ? "Creating…" : "Create customer"}
    </Button>
  );
}

/** Draws the owner's footer. A component, so `create` (which reads the double-submit ref) is handed over as a prop rather than called into during render. */
function Footer({ render, ...state }: CreateState & { render: (state: CreateState) => ReactNode }) {
  return render(state);
}

const CUSTOMER_PATHS: Record<string, Path<NewCustomerValues>> = {
  name: "name",
  may_pick_partner: "mayPickPartner",
  "invitation.email": "email",
  "invitation.role": "role",
};

/**
 * erp-api's error paths as the form's fields, or null for one that isn't on screen (said above the
 * footer instead): the group while its picker is hidden, a billing field while "Bill to the shipping
 * address" is ticked.
 */
function newCustomerPath(path: string, values: NewCustomerValues, groupsShown: boolean): Path<NewCustomerValues> | null {
  if (path === "customer_group_id") return groupsShown ? "groupId" : null;
  return CUSTOMER_PATHS[path] ?? addressesPath(path, values);
}

/** One of New customer's white panels, its title an h2 that also names what's inside. */
function Section({ id, title, hint, children }: { id: string; title: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4 rounded-[20px] bg-card p-4 md:p-5">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {hint && <p className="text-caption text-ink-2">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * New customer: the Customer, Shipping address, Invoices and First person sections in one React Hook
 * Form, made with one `POST /customers`. The page (`layout="page"`, two columns from 1024 px) and New
 * order's side panel (`layout="panel"`, one column) place it and draw `footer` around the same Create.
 * While it runs every field is locked; erp-api's errors go on their fields, and anything no field shows
 * goes above the footer. Sending the same thing again after a failure reuses the `Idempotency-Key`, so
 * erp-api makes one customer.
 */
export function NewCustomerForm({
  layout,
  startName,
  onCreated,
  onDirtyChange,
  footer,
}: {
  layout: "page" | "panel";
  /** The name to start with, such as New order's typed text; counted as typed, so closing asks first. */
  startName?: string;
  /** erp-api's answer: the customer, and its `invitation` (with what became of its email) when a first person was invited, else null. */
  onCreated: (customer: CreatedCustomer) => void;
  onDirtyChange?: (dirty: boolean) => void;
  footer: (state: CreateState) => ReactNode;
}) {
  const ids = useId();
  const groups = useCustomerGroups();
  const create = useCreateCustomer();
  const [start] = useState<NewCustomerValues>(() => ({ ...EMPTY_NEW_CUSTOMER, name: startName ?? "" }));
  const form = useNewCustomerForm(start);
  const { isDirty } = useFormState({ control: form.control });
  const name = useWatch({ control: form.control, name: "name" });
  const [message, setMessage] = useState<string | null>(null);
  // Two clicks before the first one's state lands would otherwise both reach `onCreated`.
  const busy = useRef(false);

  const dirty = isDirty || start.name.trim() !== "";
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function save(values: NewCustomerValues) {
    setMessage(null);
    const body = newCustomerBody(values);
    try {
      const customer = await create.mutateAsync(body);
      onCreated(customer);
    } catch (error) {
      const groupsShown = Boolean(groups.data);
      setMessage(applySaveErrors(error, (path) => newCustomerPath(path, values, groupsShown), form.setError));
    }
  }

  function submit() {
    if (busy.current) return;
    busy.current = true;
    void form.handleSubmit(save)().finally(() => {
      busy.current = false;
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  const page = layout === "page";
  const customer = (
    <Section id={`${ids}-customer`} title="Customer">
      <CustomerFields groups={groups.data ?? null} nameNote={<NameWarning name={name} />} />
    </Section>
  );
  const shipping = (
    <Section id={`${ids}-shipping`} title="Shipping address" hint="Orders ship here unless the order says otherwise.">
      <ShippingFields compact={page} labelledBy={`${ids}-shipping`} />
    </Section>
  );
  const invoices = (
    <Section id={`${ids}-invoices`} title="Invoices">
      <InvoicesFields compact={page} labelledBy={`${ids}-invoices`} hint="Untick to send invoices somewhere else; the billing address opens here." />
    </Section>
  );
  const person = (
    <Section
      id={`${ids}-person`}
      title={
        <>
          First person <span className="font-normal text-ink-2">(optional)</span>
        </>
      }
      hint="Someone who orders for this customer on the customer site."
    >
      <PersonFields />
    </Section>
  );

  const creating = create.isPending;
  const column = "flex min-w-0 flex-col gap-3.5";

  return (
    <form noValidate onSubmit={onSubmit} className="flex min-w-0 flex-col gap-3.5">
      <fieldset disabled={creating} className="min-w-0">
        <FormProvider {...form}>
          {page ? (
            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
              <div className={column}>
                {customer}
                {shipping}
              </div>
              <div className={column}>
                {invoices}
                {person}
              </div>
            </div>
          ) : (
            <div className={column}>
              {customer}
              {shipping}
              {invoices}
              {person}
            </div>
          )}
        </FormProvider>
      </fieldset>
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <Footer render={footer} creating={creating} create={submit} />
    </form>
  );
}
