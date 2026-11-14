"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { PartnerJob } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { doneText, jobTitle, piecesText, scrappedText } from "@/lib/partner-jobs/labels";

import { jobHref } from "./offer-actions";
import { useWorkshop } from "./use-workshop";

/**
 * One accepted job in the Jobs tabs, as a link to its Job page: the title, then
 * pieces, progress, scrapped pieces, due date and pay. A card on phones, one
 * line from 1024px.
 */
export function JobRow({ job }: { job: PartnerJob }) {
  const { partnerId } = useWorkshop();
  const format = useFormat();
  const details = [
    piecesText(job.quantity),
    doneText(job),
    scrappedText(job),
    job.due_on ? `Due ${format.day(job.due_on)}` : null,
    format.money(job.cost, format.currency),
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <li>
      <Link
        href={jobHref(partnerId, job.id)}
        className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet md:rounded-lg md:border-0 md:px-3"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:items-baseline lg:gap-3">
          <span className="min-w-0 text-sm font-semibold break-words text-ink">{jobTitle(job)}</span>{" "}
          <span className="text-sm text-ink-2 lg:shrink-0">{details}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-2" />
      </Link>
    </li>
  );
}
