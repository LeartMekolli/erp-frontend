"use client";

import { useId, useState } from "react";

import { Field } from "@/components/auth/field";
import { Input } from "@/components/ui/input";
import { termsProblems, type TermsValues } from "@/lib/customers/form";

export type TermsErrors = Partial<Record<"terms" | "daysToPay" | "creditLimit", string>>;

const CHOICES: { value: TermsValues["terms"]; label: string }[] = [
  { value: "pay_first", label: "Pay first" },
  { value: "pay_later", label: "Pay later" },
];

/**
 * The Payment terms section: pay first, or pay later with days to pay and a credit limit (empty for none).
 * The limit stays the text typed; it's sent as erp-api's amount string, never a number.
 */
export function TermsFields({
  value,
  onChange,
  currency,
  errors = {},
  showProblems = false,
}: {
  value: TermsValues;
  onChange: (next: TermsValues) => void;
  /** The customer's money's currency (`payment_terms.currency`), shown with the limit. */
  currency: string;
  errors?: TermsErrors;
  showProblems?: boolean;
}) {
  const id = useId();
  const [left, setLeft] = useState<ReadonlySet<"daysToPay" | "creditLimit">>(() => new Set());
  const problems = termsProblems(value);
  const errorFor = (field: "daysToPay" | "creditLimit") => errors[field] ?? (left.has(field) || showProblems ? problems[field] : undefined);
  const leave = (field: "daysToPay" | "creditLimit") => setLeft((current) => new Set(current).add(field));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div role="radiogroup" aria-label="Terms" aria-describedby={errors.terms ? `${id}-terms-error` : undefined} className="inline-flex self-start rounded-[10px] bg-ground p-[3px]">
          {CHOICES.map((choice) => (
            <label
              key={choice.value}
              className="flex min-h-9 cursor-pointer items-center rounded-lg px-3.5 text-sm whitespace-nowrap text-ink-2 has-checked:bg-card has-checked:font-medium has-checked:text-ink has-checked:shadow-[0_1px_2px_rgb(22_20_28/0.08)] has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-violet pointer-coarse:min-h-11"
            >
              <input
                type="radio"
                name={`${id}-terms`}
                value={choice.value}
                checked={value.terms === choice.value}
                onChange={() => onChange({ ...value, terms: choice.value })}
                className="sr-only"
              />
              {choice.label}
            </label>
          ))}
        </div>
        {errors.terms && (
          <p id={`${id}-terms-error`} className="text-caption text-late">
            {errors.terms}
          </p>
        )}
      </div>

      {value.terms === "pay_later" && (
        <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <Field id={`${id}-days`} label="Days to pay" error={errorFor("daysToPay")}>
            {(props) => (
              <Input
                {...props}
                value={value.daysToPay}
                inputMode="numeric"
                maxLength={3}
                autoComplete="off"
                onChange={(event) => onChange({ ...value, daysToPay: event.target.value })}
                onBlur={() => leave("daysToPay")}
              />
            )}
          </Field>
          <Field id={`${id}-limit`} label="Credit limit (optional)" hint={`In ${currency}. Leave empty for no limit.`} error={errorFor("creditLimit")}>
            {(props) => (
              <Input
                {...props}
                value={value.creditLimit}
                inputMode="decimal"
                maxLength={19}
                autoComplete="off"
                placeholder="No limit"
                onChange={(event) => onChange({ ...value, creditLimit: event.target.value })}
                onBlur={() => leave("creditLimit")}
              />
            )}
          </Field>
        </div>
      )}
    </div>
  );
}
