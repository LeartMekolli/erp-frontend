import { cn } from "cn";

import type { Customer } from "@/lib/api/schema-types";
import { STATUS_LABEL } from "@/lib/customers/labels";

const DOT: Record<Customer["status"], string> = { active: "bg-ship", disabled: "bg-ink-2" };

/** A customer's status as a dot plus the word, never colour alone. */
export function CustomerStatus({ status, className }: { status: Customer["status"]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-ink", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
