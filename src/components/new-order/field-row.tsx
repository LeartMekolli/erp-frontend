"use client";

import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";

export interface ControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

/**
 * One field of the New order page: its label above the control on a phone and beside it from a tablet
 * up, then erp-api's reasons for refusing it and a hint. Given a function, it hands over the props
 * a single control needs; given plain children (radios), it wraps them in a labelled radio group.
 */
export function FieldRow({
  label,
  hint,
  problems = [],
  invalid = false,
  children,
}: {
  label: string;
  hint?: string;
  /** Why this field was refused, each shown under it in words. */
  problems?: readonly string[];
  /** Marks the field invalid when the reasons are shown under another field. */
  invalid?: boolean;
  children: ReactNode | ((props: ControlProps) => ReactNode);
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const problemsId = problems.length > 0 ? `${id}-problems` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const props: ControlProps = {
    id,
    "aria-invalid": invalid || problems.length > 0,
    "aria-describedby": [problemsId, hintId].filter(Boolean).join(" ") || undefined,
  };

  return (
    <div className="flex flex-col gap-1.5 md:grid md:grid-cols-[7rem_1fr] md:items-start md:gap-x-4">
      {typeof children === "function" ? (
        <Label htmlFor={id} className="md:pt-4">
          {label}
        </Label>
      ) : (
        <span id={labelId} className="text-caption font-medium text-ink md:pt-4">
          {label}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        {typeof children === "function" ? (
          children(props)
        ) : (
          <div role="radiogroup" aria-labelledby={labelId} aria-invalid={props["aria-invalid"]} aria-describedby={props["aria-describedby"]} className="flex flex-wrap gap-2">
            {children}
          </div>
        )}
        {problemsId && (
          <ul id={problemsId} className="flex flex-col gap-0.5 text-caption text-late">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {hint && (
          <p id={hintId} className="text-caption text-ink-2">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
