"use client";

import Link from "next/link";

import type { PartnerJob } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { answerByText, jobTitle, piecesText, stepsText } from "@/lib/partner-jobs/labels";

import { Cell, ROW, rowClick, rowFocus } from "./job-table-row";
import { OfferActions } from "./offer-actions";
import { TimeLeft } from "./time-left";

/**
 * One offer waiting for an answer: the job, pieces, the partner's steps, when to answer by and how long
 * is left, the pay, then Decline and Accept. Below 768px the first four sit in one cell, and the answers
 * stack in the last. Focus entering or leaving the row (its dialogs included) is reported, so a run-out
 * offer can hand focus to the notice.
 */
export function OfferTableRow({
  job,
  href,
  now,
  focusable,
  onFocus,
  onOpen,
  onFocusIn,
  onFocusOut,
}: {
  job: PartnerJob;
  href: string;
  now: number;
  focusable: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onFocusIn: () => void;
  onFocusOut: () => void;
}) {
  const format = useFormat();
  const title = jobTitle(job);
  const pay = format.money(job.cost, format.currency);
  const steps = stepsText(job.steps);
  const roving = rowFocus(onFocus);

  return (
    <tr
      data-row-id={job.id}
      tabIndex={focusable ? 0 : -1}
      onClick={rowClick(onOpen)}
      onFocus={(event) => {
        onFocusIn();
        roving(event);
      }}
      onBlur={onFocusOut}
      className={ROW}
    >
      <Cell className="w-full max-w-0 md:hidden">
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between gap-3">
            <Link href={href} className="truncate font-semibold text-ink" title={title}>
              {title}
            </Link>
            <span className="shrink-0 font-medium tabular-nums">{pay}</span>
          </span>
          <span className="text-caption text-ink-2">{[piecesText(job.quantity), job.due_on ? `Due ${format.day(job.due_on)}` : null].filter(Boolean).join(" · ")}</span>
          {job.expires_at && <TimeLeft expiresAt={job.expires_at} now={now} />}
        </span>
      </Cell>

      <Cell className="hidden w-full max-w-0 md:table-cell">
        <span className="flex min-w-0 flex-col">
          <Link href={href} className="truncate font-semibold text-ink hover:underline" title={title}>
            {title}
          </Link>
          {steps && <span className="truncate text-caption text-ink-2 xl:hidden">{steps}</span>}
        </span>
      </Cell>
      <Cell className="hidden text-ink tabular-nums md:table-cell">{job.quantity}</Cell>
      <Cell className="hidden text-ink-2 xl:table-cell">{steps}</Cell>
      <Cell className="hidden md:table-cell">
        {job.expires_at && (
          <span className="flex flex-col gap-0.5">
            <span className="whitespace-nowrap text-ink">{answerByText(job.expires_at, format.timeZone)}</span>
            <TimeLeft expiresAt={job.expires_at} now={now} />
          </span>
        )}
      </Cell>
      <Cell className="hidden text-right font-medium whitespace-nowrap tabular-nums md:table-cell">{pay}</Cell>
      <Cell className="w-px">
        <OfferActions job={job} className="flex flex-col gap-2 md:flex-row md:justify-end" />
      </Cell>
    </tr>
  );
}
