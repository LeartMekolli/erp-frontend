"use client";

import { ChevronLeft, CircleX, FileBox } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { cn } from "cn";

import { submitErrorText } from "@/components/production/submit-error";
import { Button } from "@/components/ui/button";
import type { PartnerJobDetail } from "@/lib/api/schema-types";
import { openLink } from "@/lib/files/open-link";
import { useFormat } from "@/lib/format/use-format";
import { workspaceToday } from "@/lib/orders/labels";
import { doneText, dueText, jobTitle, lostText, piecesText } from "@/lib/partner-jobs/labels";
import { partnerDesignUrl } from "@/lib/partner-jobs/queries";

import { useWorkshop } from "./use-workshop";

const STATUS: Record<PartnerJobDetail["status"], { word: string; dot: string }> = {
  offered: { word: "Offered", dot: "bg-violet" },
  accepted: { word: "In progress", dot: "bg-violet" },
  finished: { word: "Finished", dot: "bg-ship" },
};

/**
 * The job at a glance, in Order detail's header layout: the `Jobs` link, the title, then its status
 * as a dot and a word, pieces, progress, the due day and (under 1280px, where the side column drops
 * below) the pay. `actions` sit on the right: the answers to an offer, or the design file once held.
 */
export function JobHeader({ job, jobs, actions }: { job: PartnerJobDetail; jobs: string; actions?: ReactNode }) {
  const format = useFormat();
  const [today] = useState(() => workspaceToday(format.timeZone));
  const status = STATUS[job.status];
  const inProgress = job.status === "accepted";
  const due = inProgress ? dueText(job.due_on, today) : job.due_on ? { text: `Due ${format.day(job.due_on)}`, late: false } : null;
  const late = due?.late ?? false;
  const lost = lostText(job);

  return (
    <header className="flex flex-col gap-3 pt-1">
      <BackToJobs href={jobs} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-title font-semibold break-words">{jobTitle(job)}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-2">
            <span className={cn("inline-flex items-center gap-2 font-medium", late ? "text-late" : "text-ink")}>
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", late ? "bg-late" : status.dot)} />
              {late ? `${status.word} · Late` : status.word}
            </span>
            <span>{piecesText(job.quantity)}</span>
            {job.status !== "offered" && <span>{doneText(job)}</span>}
            {lost && (
              <span className="inline-flex items-center gap-1 font-medium text-lost-ink">
                <CircleX aria-hidden className="size-3.5 shrink-0" />
                {lost}
              </span>
            )}
            {due && <span className={cn(late && "font-semibold text-late")}>{due.text}</span>}
            <span className="font-medium text-ink tabular-nums xl:hidden">{format.money(job.cost, format.currency)}</span>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** The job's design file, once the partner holds it; says so under the button when the link can't be had. */
export function DesignFileButton({ job }: { job: PartnerJobDetail }) {
  const { partnerId } = useWorkshop();
  const [failure, setFailure] = useState<string | null>(null);
  if (!job.design_file_version_id) return null;
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        className="rounded-full"
        onClick={() => {
          setFailure(null);
          openLink(() => partnerDesignUrl(partnerId, job.id)).catch((error: unknown) => setFailure(submitErrorText(error)));
        }}
      >
        <FileBox aria-hidden />
        Design file
      </Button>
      {failure && <span className="text-caption text-late">{failure}</span>}
    </span>
  );
}

export function BackToJobs({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 self-start font-medium text-ink-2 hover:text-ink md:min-h-0">
      <ChevronLeft aria-hidden className="size-4" />
      Jobs
    </Link>
  );
}
