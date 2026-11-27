"use client";

import { useId } from "react";
import { useController, useFormContext, useFormState, type FieldErrors } from "react-hook-form";

import { Field } from "@/components/auth/field";
import { AddressForm } from "@/components/new-order/address-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { VAT_LIMIT, type AddressesValues } from "@/lib/customers/form";
import { ADDRESS_FIELDS, type AddressField } from "@/lib/new-order/form";

/** One address's errors as `AddressForm` takes them: words by field. */
function messages(errors: FieldErrors<AddressesValues>["shipping"]): Partial<Record<AddressField, string>> {
  const byField = errors as Partial<Record<AddressField, { message?: string }>> | undefined;
  const words: Partial<Record<AddressField, string>> = {};
  for (const field of ADDRESS_FIELDS) {
    const message = byField?.[field]?.message;
    if (message) words[field] = message;
  }
  return words;
}

/**
 * `compact` lays each address out in the four-column grid (`AddressForm`), for New customer's panels.
 * `labelledBy` names the fieldset by a title outside it (New customer's panel h2) and drops its own
 * legend, so the name isn't shown or announced twice.
 */
interface HalfProps {
  compact?: boolean;
  labelledBy?: string;
}

/** The section's legend, unless a title outside it names it. */
function Legend({ labelledBy, children }: { labelledBy?: string; children: string }) {
  return labelledBy ? null : <legend className="mb-3 text-sm font-semibold text-ink">{children}</legend>;
}

/** The Shipping address section: where orders ship, in a form holding `AddressesValues`. */
export function ShippingFields({ compact = false, labelledBy }: HalfProps) {
  const { control } = useFormContext<AddressesValues>();
  const { errors } = useFormState({ control });
  const shipping = useController({ control, name: "shipping" });

  return (
    <fieldset className="flex flex-col gap-3" aria-labelledby={labelledBy}>
      <Legend labelledBy={labelledBy}>Shipping address</Legend>
      <AddressForm value={shipping.field.value} onChange={shipping.field.onChange} errors={messages(errors.shipping)} compact={compact} />
    </fieldset>
  );
}

/** The Invoices section: "Bill to the shipping address" (unticked, a billing address opens below it) and the VAT number. */
export function InvoicesFields({ compact = false, labelledBy, hint }: HalfProps & { /** Words under "Bill to the shipping address". */ hint?: string }) {
  const id = useId();
  const { control, register } = useFormContext<AddressesValues>();
  const { errors } = useFormState({ control });
  const billing = useController({ control, name: "billing" });
  const same = useController({ control, name: "billToShipping" });

  return (
    <fieldset className="flex flex-col gap-3" aria-labelledby={labelledBy}>
      <Legend labelledBy={labelledBy}>Invoices</Legend>
      {hint ? (
        <div className="flex items-start gap-3">
          <Checkbox
            id={`${id}-same`}
            checked={same.field.value}
            onCheckedChange={(checked) => same.field.onChange(checked === true)}
            onBlur={same.field.onBlur}
            aria-describedby={`${id}-same-hint`}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <label htmlFor={`${id}-same`} className="text-sm font-medium text-ink">
              Bill to the shipping address
            </label>
            <p id={`${id}-same-hint`} className="text-caption text-ink-2">
              {hint}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-11 items-center gap-3 pointer-fine:min-h-9">
          <Checkbox id={`${id}-same`} checked={same.field.value} onCheckedChange={(checked) => same.field.onChange(checked === true)} onBlur={same.field.onBlur} />
          <label htmlFor={`${id}-same`} className="text-sm font-medium text-ink">
            Bill to the shipping address
          </label>
        </div>
      )}
      {!same.field.value && (
        <div className="flex flex-col gap-3" role="group" aria-label="Billing address">
          <p className="text-caption font-medium text-ink-2">Billing address</p>
          <AddressForm value={billing.field.value} onChange={billing.field.onChange} errors={messages(errors.billing)} compact={compact} />
        </div>
      )}
      <Field id={`${id}-vat`} label="VAT number (optional)" error={errors.vat?.message}>
        {(props) => <Input {...props} {...register("vat")} maxLength={VAT_LIMIT} autoComplete="off" />}
      </Field>
    </fieldset>
  );
}

/**
 * Both halves, in a `useAddressesForm` (`section-forms.ts`). They save together with
 * `PUT /customers/{id}/addresses`, so Details' Edit shows both; New customer lays them out as two panels
 * with `ShippingFields` and `InvoicesFields`.
 */
export function AddressesFields({ compact = false }: HalfProps) {
  return (
    <div className="flex flex-col gap-5">
      <ShippingFields compact={compact} />
      <InvoicesFields compact={compact} />
    </div>
  );
}
