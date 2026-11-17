"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Address } from "@/lib/api/schema-types";
import { ADDRESS_FIELDS, ADDRESS_LIMITS, addressProblems, type AddressField, type AddressProblem } from "@/lib/new-order/form";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";

const OPTIONAL: ReadonlySet<AddressField> = new Set(["line2", "region", "phone"]);
/** Fields given the whole width from a tablet up; the others share a row in pairs. */
const WIDE: ReadonlySet<AddressField> = new Set(["name", "line1", "line2"]);

function problemText(problem: AddressProblem, field: AddressField): string {
  if (problem === "missing") return COPY.delivery.problems.missing;
  if (problem === "country") return COPY.delivery.problems.country;
  return COPY.delivery.problems.tooLong(ADDRESS_LIMITS[field]);
}

/**
 * An address for this order only, with erp-api's limits on each field. What is wrong with a field shows
 * under it once staff leave it; `errors` (erp-api's, at placing) show at once. The country is upper-cased
 * as it is typed.
 */
export function AddressForm({
  value,
  onChange,
  errors = {},
}: {
  value: Address;
  onChange: (next: Address) => void;
  /** erp-api's reasons for refusing a field, by field. */
  errors?: Partial<Record<AddressField, string>>;
}) {
  const id = useId();
  const [left, setLeft] = useState<ReadonlySet<AddressField>>(() => new Set());
  const problems = addressProblems(value);

  function change(field: AddressField, text: string) {
    onChange({ ...value, [field]: field === "country" ? text.toUpperCase() : text });
  }

  function leave(field: AddressField) {
    setLeft((current) => (current.has(field) ? current : new Set(current).add(field)));
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ADDRESS_FIELDS.map((field) => {
        const inputId = `${id}-${field}`;
        const problem = problems[field];
        const message = errors[field] ?? (problem && left.has(field) ? problemText(problem, field) : undefined);
        const messageId = message ? `${inputId}-problem` : undefined;
        const hintId = field === "country" ? `${inputId}-hint` : undefined;
        return (
          <div key={field} className={cn("flex min-w-0 flex-col gap-1.5", WIDE.has(field) && "sm:col-span-2")}>
            <Label htmlFor={inputId}>{COPY.delivery.fields[field]}</Label>
            <Input
              id={inputId}
              type={field === "phone" ? "tel" : "text"}
              value={value[field] ?? ""}
              maxLength={ADDRESS_LIMITS[field]}
              autoComplete="off"
              autoCapitalize={field === "country" ? "characters" : undefined}
              aria-required={!OPTIONAL.has(field)}
              aria-invalid={message !== undefined}
              aria-describedby={[messageId, hintId].filter(Boolean).join(" ") || undefined}
              onChange={(event) => change(field, event.target.value)}
              onBlur={() => leave(field)}
            />
            {message && (
              <p id={messageId} className="text-caption text-late">
                {message}
              </p>
            )}
            {hintId && (
              <p id={hintId} className="text-caption text-ink-2">
                {COPY.delivery.countryHint}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
