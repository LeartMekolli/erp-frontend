"use client";

import { useId } from "react";

import { Field } from "@/components/auth/field";
import { AddressForm } from "@/components/new-order/address-form";
import { COPY } from "@/components/new-order/copy";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addressesProblems, VAT_LIMIT, type AddressesValues } from "@/lib/customers/form";
import { ADDRESS_LIMITS, type AddressField, type AddressProblem } from "@/lib/new-order/form";

type FieldErrors = Partial<Record<AddressField, string>>;

export interface AddressesErrors {
  shipping?: FieldErrors;
  billing?: FieldErrors;
  vat?: string;
}

function problemText(problem: AddressProblem, field: AddressField): string {
  if (problem === "missing") return COPY.delivery.problems.missing;
  if (problem === "country") return COPY.delivery.problems.country;
  return COPY.delivery.problems.tooLong(ADDRESS_LIMITS[field]);
}

/** Every problem as words, for a Save that was stopped; erp-api's own reasons win. */
function shown(problems: Partial<Record<AddressField, AddressProblem>>, server: FieldErrors | undefined, all: boolean): FieldErrors {
  const words: FieldErrors = {};
  if (all) for (const [field, problem] of Object.entries(problems) as [AddressField, AddressProblem][]) words[field] = problemText(problem, field);
  return { ...words, ...server };
}

/**
 * The Shipping address and Invoices sections: where orders ship, then "Bill to the shipping address"
 * (unticked, a billing address opens below it) and the VAT number. They save together with
 * `PUT /customers/{id}/addresses`, so Details' Edit shows both; part 2's New customer lays them out as
 * two panels.
 */
export function AddressesFields({
  value,
  onChange,
  errors = {},
  showProblems = false,
}: {
  value: AddressesValues;
  onChange: (next: AddressesValues) => void;
  errors?: AddressesErrors;
  showProblems?: boolean;
}) {
  const id = useId();
  const problems = addressesProblems(value);
  const vatError = errors.vat ?? (showProblems ? problems.vat : undefined);

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-ink">Shipping address</legend>
        <AddressForm value={value.shipping} onChange={(shipping) => onChange({ ...value, shipping })} errors={shown(problems.shipping, errors.shipping, showProblems)} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-ink">Invoices</legend>
        <div className="flex min-h-11 items-center gap-3 pointer-fine:min-h-9">
          <Checkbox id={`${id}-same`} checked={value.billToShipping} onCheckedChange={(checked) => onChange({ ...value, billToShipping: checked === true })} />
          <label htmlFor={`${id}-same`} className="text-sm font-medium text-ink">
            Bill to the shipping address
          </label>
        </div>
        {!value.billToShipping && (
          <div className="flex flex-col gap-3" role="group" aria-label="Billing address">
            <p className="text-caption font-medium text-ink-2">Billing address</p>
            <AddressForm value={value.billing} onChange={(billing) => onChange({ ...value, billing })} errors={shown(problems.billing, errors.billing, showProblems)} />
          </div>
        )}
        <Field id={`${id}-vat`} label="VAT number (optional)" error={vatError}>
          {(props) => <Input {...props} value={value.vat} maxLength={VAT_LIMIT} autoComplete="off" onChange={(event) => onChange({ ...value, vat: event.target.value })} />}
        </Field>
      </fieldset>
    </div>
  );
}
