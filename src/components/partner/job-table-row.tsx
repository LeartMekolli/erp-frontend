"use client";

import { cn } from "cn";
import { CircleX } from "lucide-react";
import Link from "next/link";
import type { FocusEvent, MouseEvent, ReactNode } from "react";

import type { PartnerJob } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { doneText, dueText, jobTitle, lostText, piecesText } from "@/lib/partner-jobs/labels";

/** Clicks on these do their own thing, never open the job. */
const OWN_CLICK = "a, button, input, label, [role='menuitem']";

/** Orders' row and cell look (`src/components/orders/order-row.tsx`). */
export const ROW =
  "cursor-pointer text-sm outline-none hover:bg-panel-soft focus-visible:bg-panel-soft focus-visible:shadow-[inset_3px_0_0_var(--color-violet)]";
export const TH = "px-3 pt-3 pb-2 text-left text-xs font-medium text-ink-2";

export function Cell({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("border-t border-line px-3 py-2.5 align-middle", className)}>{children}</td>;
}

/** Opens the row's job on a click that isn't on one of its own controls, or that came through a portal. */
export function rowClick(onOpen: () => void) {
  return (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target) || target.closest(OWN_CLICK)) return;
    onOpen();
  };
}

/** Roving focus: only focus on the row itself makes it the active one. */
export function rowFocus(onFocus: () => void) {
  return (event: FocusEvent<HTMLTableRowElement>) => {
    if (event.target === event.currentTarget) onFocus();
  };
}

/** Done so far, and any lost pieces with an icon and the word, in the lost colour. */
export function Progress({ job }: { job: PartnerJob }) {
  const lost = lostText(job);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span>{doneText(job)}</span>
      {lost && (
        <span className="inline-flex items-center gap-1 font-medium text-lost-ink">
          <CircleX aria-hidden className="size-3.5 shrink-0" />
          {lost}
        </span>
      )}
    </span>
  );
}

/**
 * One accepted or finished job. From 768px a column each; below, three lines: the job and its pay,
 * pieces and progress, the due day. Lateness counts only while the job is in progress.
 */
export function JobTableRow({
  job,
  href,
  today,
  inProgress,
  focusable,
  onFocus,
  onOpen,
}: {
  job: PartnerJob;
  href: string;
  today: string;
  inProgress: boolean;
  focusable: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const format = useFormat();
  const title = jobTitle(job);
  const pay = format.money(job.cost, format.currency);
  const due = inProgress ? dueText(job.due_on, today) : job.due_on ? { text: `Due ${format.day(job.due_on)}`, late: false } : null;
  const dueClass = due?.late ? "font-semibold text-late" : "text-ink";

  return (
    <tr data-row-id={job.id} tabIndex={focusable ? 0 : -1} onClick={rowClick(onOpen)} onFocus={rowFocus(onFocus)} className={ROW}>
      {/* Phone: three lines in one cell, cut rather than widening the table. */}
      <Cell className="w-full max-w-0 md:hidden">
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between gap-3">
            <Link href={href} className="truncate font-semibold text-ink" title={title}>
              {title}
            </Link>
            <span className="shrink-0 font-medium tabular-nums">{pay}</span>
          </span>
          <span className="text-caption text-ink-2">
            {piecesText(job.quantity)} · <Progress job={job} />
          </span>
          {due && <span className={cn("text-caption", dueClass)}>{due.text}</span>}
        </span>
      </Cell>

      <Cell className="hidden w-full max-w-0 md:table-cell">
        <Link href={href} className="block truncate font-semibold text-ink hover:underline" title={title}>
          {title}
        </Link>
      </Cell>
      <Cell className="hidden text-ink tabular-nums md:table-cell">{job.quantity}</Cell>
      <Cell className="hidden whitespace-nowrap text-ink-2 md:table-cell">
        <Progress job={job} />
      </Cell>
      <Cell className={cn("hidden whitespace-nowrap md:table-cell", dueClass)}>{due?.text ?? "—"}</Cell>
      <Cell className="hidden text-right font-medium whitespace-nowrap tabular-nums md:table-cell">{pay}</Cell>
    </tr>
  );
}
