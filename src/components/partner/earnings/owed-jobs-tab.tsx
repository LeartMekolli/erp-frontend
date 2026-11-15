"use client";

import Link from "next/link";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import type { OwedJob } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";
import { owedJobWords, signOf } from "@/lib/partner-earnings/labels";
import type { usePartnerOwed } from "@/lib/partner-earnings/queries";
import { piecesText } from "@/lib/partner-jobs/labels";

import { jobHref } from "../offer-actions";

const rowClass =
  "grid min-h-11 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_7rem]";

function JobLine({ job, currency }: { job: OwedJob; currency: string }) {
  const paid = signOf(job.paid) !== 0;
  return (
    <>
      <span className="min-w-0 truncate font-medium">{`${job.product?.name ?? "Job"} · ${piecesText(job.quantity)}`}</span>
      <span className="row-start-2 text-caption text-ink-2 md:row-start-auto md:text-sm">{owedJobWords(job, currency).join(" · ")}</span>
      <span className="col-start-2 row-start-1 text-right font-semibold tabular-nums md:col-start-auto md:row-start-auto">
        {formatMoney(job.amount, currency)}
      </span>
      <span className="col-start-2 row-start-2 text-right text-caption text-ink-2 tabular-nums md:col-start-auto md:row-start-auto md:text-sm">
        {paid ? `Paid ${formatMoney(job.paid, currency)}` : ""}
      </span>
    </>
  );
}

/**
 * The Jobs tab: every job the workshop has or had, what it's worth and where its pay stands, newest
 * hand-over first. A job still the workshop's opens its Job page; one taken back or cancelled doesn't,
 * since that page would turn the partner away.
 */
export function OwedJobsTab({ owed, partnerId }: { owed: ReturnType<typeof usePartnerOwed>; partnerId: string }) {
  if (owed.isPending) {
    return (
      <div role="status" aria-label="Loading your jobs" className="flex flex-col gap-2">
        {[0, 1, 2].map((n) => (
          <div key={n} aria-hidden className="h-11 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  if (!owed.totals) {
    return <LoadFailure error={owed.error} fallback="Your jobs' pay couldn't be loaded." onRetry={() => void owed.refetch()} />;
  }
  if (owed.items.length === 0) return <p className="px-1 py-6 text-center text-sm text-ink-2">No jobs yet. A job shows here once you accept it.</p>;

  const { currency } = owed.totals;
  return (
    <>
      <ul className="flex flex-col md:divide-y md:divide-line">
        {owed.items.map((job) => (
          <li key={job.assignment_id}>
            {job.holding === "with_you" ? (
              <Link
                href={jobHref(partnerId, job.group_id)}
                className={`${rowClass} hover:bg-ground focus-visible:outline-2 focus-visible:outline-violet`}
              >
                <JobLine job={job} currency={currency} />
              </Link>
            ) : (
              <div className={rowClass}>
                <JobLine job={job} currency={currency} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <ListEnd list={owed} />
    </>
  );
}
