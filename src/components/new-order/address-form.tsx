"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Address } from "@/lib/api/schema-types";
import { ADDRESS_FIELDS, ADDRESS_LIMITS, OPTIONAL_ADDRESS_FIELDS, addressProblems, type AddressField, type AddressProblem } from "@/lib/new-order/form";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";

const OPTIONAL: ReadonlySet<AddressField> = new Set<AddressField>(OPTIONAL_ADDRESS_FIELDS);
/** Fields given the whole width from a tablet up; the others share a row in pairs. */
const WIDE: ReadonlySet<AddressField> = new Set(["name", "line1", "line2"]);

/** The compact layout's order, which is its visual order: Name beside Phone, the lines, then one row of four. */
const COMPACT_ORDER: readonly AddressField[] = ["name", "phone", "line1", "line2", "city", "postal_code", "region", "country"];
/** Fields that take half the compact row. */
const HALF: ReadonlySet<AddressField> = new Set(["name", "phone", "line1", "line2"]);

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
  compact = false,
}: {
  value: Address;
  onChange: (next: Address) => void;
  /** erp-api's reasons for refusing a field, by field. */
  errors?: Partial<Record<AddressField, string>>;
  /** From a tablet up, a four-column grid: Name beside Phone, line 1 beside line 2, then City, Postal code, Region and Country in one row. */
  compact?: boolean;
}) {
  const id = useId();
  const [left, setLeft] = useState<ReadonlySet<AddressField>>(() => new Set());
  const problems = addressProblems(value);
  const fields: readonly AddressField[] = compact ? COMPACT_ORDER : ADDRESS_FIELDS;

  function change(field: AddressField, text: string) {
    onChange({ ...value, [field]: field === "country" ? text.toUpperCase() : text });
  }

  function leave(field: AddressField) {
    setLeft((current) => (current.has(field) ? current : new Set(current).add(field)));
  }

  return (
    <div className={cn("grid gap-3", compact ? "md:grid-cols-[1.4fr_1fr_1fr_0.8fr]" : "sm:grid-cols-2")}>
      {fields.map((field) => {
        const inputId = `${id}-${field}`;
        const problem = problems[field];
        const message = errors[field] ?? (problem && left.has(field) ? problemText(problem, field) : undefined);
        const messageId = message ? `${inputId}-problem` : undefined;
        const hintId = field === "country" ? `${inputId}-hint` : undefined;
        return (
          <div key={field} className={cn("flex min-w-0 flex-col gap-1.5", compact ? HALF.has(field) && "md:col-span-2" : WIDE.has(field) && "sm:col-span-2")}>
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
