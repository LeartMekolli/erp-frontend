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
 * The Shipping address and Invoices sections, in a `useAddressesForm` (`section-forms.ts`): where orders
 * ship, then "Bill to the shipping address" (unticked, a billing address opens below it) and the VAT
 * number. They save together with `PUT /customers/{id}/addresses`, so Details' Edit shows both; part 2's
 * New customer lays them out as two panels.
 */
export function AddressesFields() {
  const id = useId();
  const { control, register } = useFormContext<AddressesValues>();
  const { errors } = useFormState({ control });
  const shipping = useController({ control, name: "shipping" });
  const billing = useController({ control, name: "billing" });
  const same = useController({ control, name: "billToShipping" });

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-ink">Shipping address</legend>
        <AddressForm value={shipping.field.value} onChange={shipping.field.onChange} errors={messages(errors.shipping)} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-ink">Invoices</legend>
        <div className="flex min-h-11 items-center gap-3 pointer-fine:min-h-9">
          <Checkbox id={`${id}-same`} checked={same.field.value} onCheckedChange={(checked) => same.field.onChange(checked === true)} onBlur={same.field.onBlur} />
          <label htmlFor={`${id}-same`} className="text-sm font-medium text-ink">
            Bill to the shipping address
          </label>
        </div>
        {!same.field.value && (
          <div className="flex flex-col gap-3" role="group" aria-label="Billing address">
            <p className="text-caption font-medium text-ink-2">Billing address</p>
            <AddressForm value={billing.field.value} onChange={billing.field.onChange} errors={messages(errors.billing)} />
          </div>
        )}
        <Field id={`${id}-vat`} label="VAT number (optional)" error={errors.vat?.message}>
          {(props) => <Input {...props} {...register("vat")} maxLength={VAT_LIMIT} autoComplete="off" />}
        </Field>
      </fieldset>
    </div>
  );
}
