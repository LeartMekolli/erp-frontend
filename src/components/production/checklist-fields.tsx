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

/** One side of the Yes | No toggle: a real radio, drawn as a segment that turns white when picked. */
function Segment({ label, value, field }: { label: string; value: string; field: ReturnType<UseFormRegister<MoveValues>> }) {
  return (
    <label className="relative">
      <input type="radio" value={value} className="peer absolute inset-0 size-full cursor-pointer opacity-0" {...field} />
      <span className="grid min-h-[38px] min-w-16 place-items-center rounded-lg px-3 text-sm font-medium text-ink-2 peer-checked:bg-card peer-checked:text-ink peer-checked:shadow-xs peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet peer-disabled:opacity-50 pointer-coarse:min-h-11">
        {label}
      </span>
    </label>
  );
}

/** A yes/no question with its Yes | No toggle on the same row; still a group of radios for keyboards and screen readers. */
function YesNo({ item, error, field }: { item: Item; error?: string; field: ReturnType<UseFormRegister<MoveValues>> }) {
  return (
    <fieldset data-toggle className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <legend className="float-left text-sm font-medium text-ink">{item.required ? item.label : `${item.label} (optional)`}</legend>
      <div className="inline-flex rounded-[10px] bg-ground p-[3px]">
        <Segment label="Yes" value="true" field={field} />
        <Segment label="No" value="false" field={field} />
      </div>
      {error && <p className="basis-full text-caption text-late">{error}</p>}
    </fieldset>
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
            return <YesNo key={item.key} item={item} error={error} field={field} />;
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
