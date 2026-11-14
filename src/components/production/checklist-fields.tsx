"use client";

import type { ReactNode } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { Field } from "@/components/auth/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MoveValues } from "@/lib/production/move-body";
import type { ChecklistItem as Item } from "@/lib/production/shape";

function Choices({ item, error, children }: { item: Item; error?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium text-ink">{item.required ? item.label : `${item.label} (optional)`}</legend>
      <div className="flex flex-wrap gap-x-5">{children}</div>
      {error && <p className="text-caption text-late">{error}</p>}
    </fieldset>
  );
}

function Choice({ label, value, field }: { label: string; value: string; field: ReturnType<UseFormRegister<MoveValues>> }) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
      <input type="radio" value={value} className="size-4 accent-violet" {...field} />
      {label}
    </label>
  );
}

function numberHint(item: Extract<Item, { kind: "number" }>): string | undefined {
  const range = item.min !== null && item.max !== null ? `${item.min} to ${item.max}` : item.min !== null ? `At least ${item.min}` : item.max !== null ? `At most ${item.max}` : null;
  return [range, item.unit].filter(Boolean).join(" ") || undefined;
}

/** One input per item on the step's checklist, each with its own error. */
export function ChecklistFields({
  checklist,
  register,
  errors,
}: {
  checklist: Item[];
  register: UseFormRegister<MoveValues>;
  errors: FieldErrors<MoveValues>;
}) {
  return (
    <>
      {checklist.map((item) => {
        const error = errors.answers?.[item.key]?.message;
        const field = register(`answers.${item.key}`);
        const id = `checklist-${item.key}`;
        const label = item.required ? item.label : `${item.label} (optional)`;
        switch (item.kind) {
          case "yes_no":
            return (
              <Choices key={item.key} item={item} error={error}>
                <Choice label="Yes" value="true" field={field} />
                <Choice label="No" value="false" field={field} />
              </Choices>
            );
          case "choice":
            return (
              <Choices key={item.key} item={item} error={error}>
                {item.options.map((option) => (
                  <Choice key={option.key} label={option.label} value={option.key} field={field} />
                ))}
              </Choices>
            );
          case "number":
            return (
              <Field key={item.key} id={id} label={label} hint={numberHint(item)} error={error}>
                {(props) => <Input {...props} {...field} inputMode="decimal" autoComplete="off" />}
              </Field>
            );
          case "text":
            return (
              <Field key={item.key} id={id} label={label} error={error}>
                {(props) => <Textarea {...props} {...field} />}
              </Field>
            );
        }
      })}
    </>
  );
}
