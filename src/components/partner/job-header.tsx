"use client";

import { ChevronLeft, FileBox, FileText } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { submitErrorText } from "@/components/production/submit-error";
import { Button } from "@/components/ui/button";
import type { PartnerJobDetail } from "@/lib/api/schema-types";
import { openLink } from "@/lib/files/open-link";
import { useFormat } from "@/lib/format/use-format";
import { jobTitle, piecesText } from "@/lib/partner-jobs/labels";
import { partnerDesignUrl, partnerSopUrl } from "@/lib/partner-jobs/queries";

import { JobBrief } from "./job-brief";
import { useWorkshop } from "./use-workshop";

/**
 * The `Jobs` link, the title, then pieces, due date and pay, the partner's steps and the AI brief, then
 * what the job's status adds. Once the partner holds the job, its design file and each step's
 * instructions open from here; an offer's stay closed, as erp-api keeps them.
 */
export function JobHeader({ job, jobs, held, children }: { job: PartnerJobDetail; jobs: string; held: boolean; children: ReactNode }) {
  const format = useFormat();
  const { partnerId } = useWorkshop();
  const [failure, setFailure] = useState<string | null>(null);
  const details = [
    piecesText(job.quantity),
    job.due_on ? `Due ${format.day(job.due_on)}` : null,
    `You're paid ${format.money(job.cost, format.currency)}`,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  const open = (link: () => Promise<string>) => {
    setFailure(null);
    openLink(link).catch((error: unknown) => setFailure(submitErrorText(error)));
  };

  return (
    <header className="flex flex-col gap-1 rounded-[20px] bg-card px-4 py-5 sm:px-6">
      <BackToJobs href={jobs} />
      <h1 className="text-title font-semibold break-words">{jobTitle(job)}</h1>
      <p className="text-sm text-ink-2">{details}</p>
      <ul aria-label="Your steps" className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
        {job.steps.map((step) => (
          <li key={step.key} className="inline-flex items-center gap-2">
            <span className="font-medium">{step.name}</span>
            {held && step.sop_file_version_id && (
              <Button variant="link" aria-label={`Instructions for ${step.name}`} onClick={() => open(() => partnerSopUrl(partnerId, job.id, step.key))}>
                <FileText aria-hidden />
                Instructions
              </Button>
            )}
          </li>
        ))}
      </ul>
      {held && job.design_file_version_id && (
        <Button variant="outline" className="mt-1 self-start" onClick={() => open(() => partnerDesignUrl(partnerId, job.id))}>
          <FileBox aria-hidden />
          Design file
        </Button>
      )}
      {failure && <p className="text-caption text-late">{failure}</p>}
      <JobBrief summary={job.summary} />
      {children}
    </header>
  );
}

export function BackToJobs({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 self-start font-medium text-ink-2 hover:text-ink">
      <ChevronLeft aria-hidden className="size-4" />
      Jobs
    </Link>
  );
}
