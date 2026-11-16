"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const FIRST_FIELD = "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])";

/**
 * One numbered part of the New order page. Closed, it shows its title greyed with what to do first;
 * when it opens, focus moves to its first field.
 */
export function Section({
  number,
  title,
  open,
  closedHint,
  focusOnOpen = true,
  children,
}: {
  number: number;
  title: string;
  open: boolean;
  /** What to do before this section opens. */
  closedHint?: string;
  /** False for a section that opens while staff are still filling in the one above, so focus stays there. */
  focusOnOpen?: boolean;
  children?: ReactNode;
}) {
  const headingId = useId();
  const body = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current && focusOnOpen) body.current?.querySelector<HTMLElement>(FIRST_FIELD)?.focus();
    wasOpen.current = open;
  }, [open, focusOnOpen]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-[20px] bg-card px-4 py-5 sm:px-6 md:grid md:grid-cols-[10rem_1fr] md:gap-x-6">
      <div className="flex items-baseline gap-3">
        <span aria-hidden className={cn("text-sm font-semibold tabular-nums", open ? "text-ink" : "text-ink-2")}>
          {number}
        </span>
        <h2 id={headingId} className={cn("text-base font-semibold", open ? "text-ink" : "text-ink-2")}>
          {title}
        </h2>
      </div>
      {open ? (
        <div ref={body} className="flex min-w-0 flex-col gap-4">
          {children}
        </div>
      ) : (
        <p className="text-sm text-ink-2">{closedHint}</p>
      )}
    </section>
  );
}
