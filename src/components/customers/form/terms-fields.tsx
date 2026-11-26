"use client";

import { useId } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";

import { Field } from "@/components/auth/field";
import { Input } from "@/components/ui/input";
import type { TermsValues } from "@/lib/customers/form";

const CHOICES: { value: TermsValues["terms"]; label: string }[] = [
  { value: "pay_first", label: "Pay first" },
  { value: "pay_later", label: "Pay later" },
];

/**
 * The Payment terms section, in a `useTermsForm` (`section-forms.ts`): pay first, or pay later with days
 * to pay and a credit limit (empty for none). The limit stays the text typed; it's sent as erp-api's
 * amount string, never a number. Moving saved pay later terms to pay first says what saving it clears,
 * since erp-api resets the days and drops the limit.
 */
export function TermsFields({ currency }: { /** The customer's money's currency (`payment_terms.currency`), shown with the limit. */ currency: string }) {
  const id = useId();
  const { control, register } = useFormContext<TermsValues>();
  const { errors, defaultValues } = useFormState({ control });
  const terms = useWatch({ control, name: "terms" });
  const clears = defaultValues?.terms === "pay_later" && terms === "pay_first";
  const describedBy = [errors.terms ? `${id}-terms-error` : undefined, clears ? `${id}-terms-clears` : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div role="radiogroup" aria-label="Terms" aria-describedby={describedBy} className="inline-flex self-start rounded-[10px] bg-ground p-[3px]">
          {CHOICES.map((choice) => (
            <label
              key={choice.value}
              className="flex min-h-9 cursor-pointer items-center rounded-lg px-3.5 text-sm whitespace-nowrap text-ink-2 has-checked:bg-card has-checked:font-medium has-checked:text-ink has-checked:shadow-[0_1px_2px_rgb(22_20_28/0.08)] has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-violet pointer-coarse:min-h-11"
            >
              <input type="radio" value={choice.value} {...register("terms")} className="sr-only" />
              {choice.label}
            </label>
          ))}
        </div>
        {errors.terms?.message && (
          <p id={`${id}-terms-error`} className="text-caption text-late">
            {errors.terms.message}
          </p>
        )}
        {clears && (
          <p id={`${id}-terms-clears`} className="text-caption text-ink-2">
            Saving pay first clears the days to pay and the credit limit. To go back to pay later, you&apos;ll enter them again.
          </p>
        )}
      </div>

      {terms === "pay_later" && (
        <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <Field id={`${id}-days`} label="Days to pay" error={errors.daysToPay?.message}>
            {(props) => <Input {...props} {...register("daysToPay")} inputMode="numeric" maxLength={3} autoComplete="off" />}
          </Field>
          <Field id={`${id}-limit`} label="Credit limit (optional)" hint={`In ${currency}. Leave empty for no limit.`} error={errors.creditLimit?.message}>
            {(props) => <Input {...props} {...register("creditLimit")} inputMode="decimal" maxLength={19} autoComplete="off" placeholder="No limit" />}
          </Field>
        </div>
      )}
    </div>
  );
}
