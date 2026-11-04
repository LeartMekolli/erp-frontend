import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

export interface FieldControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

/** A labelled form field with its hint and error, wired for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  after,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Shown under the field, after its error: for example a "Forgot password?" link. */
  after?: ReactNode;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error && (
        <p id={errorId} className="text-[13px] text-late">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-[13px] text-ink-2">
          {hint}
        </p>
      )}
      {after}
    </div>
  );
}
