"use client";

import { CircleCheck, Clock } from "lucide-react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import type { StaffOwedJob } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";
import { piecesText } from "@/lib/partner-jobs/labels";
import { staffOwedJobWords } from "@/lib/partners/labels";

import { JobOrderRef } from "./job-order-ref";
import type { PartnerMoney } from "./use-partner-money";

/**
 * One job. On a phone the order goes under the product and the amount stays on the right; on a
 * desktop each has its column, and why staff set the amount sits under it.
 */
function JobRow({ job, currency }: { job: StaffOwedJob; currency: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-2 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_7rem]">
      <span className="col-start-1 row-start-1 min-w-0 font-medium break-words">{`${job.product?.name ?? "Removed product"} · ${piecesText(job.quantity)}`}</span>
      <span className="col-start-2 row-start-1 text-right font-semibold tabular-nums md:col-start-4">{formatMoney(job.amount, currency)}</span>
      {(job.order || job.customer_paid !== null) && (
        <div className="col-start-1 row-start-2 flex min-w-0 flex-col items-start md:col-start-2 md:row-start-1">
          <JobOrderRef order={job.order} />
          {job.customer_paid !== null && (
            <span className="flex items-center gap-1.5 text-caption text-ink-2">
              {job.customer_paid ? (
                <CircleCheck aria-hidden className="size-3.5 shrink-0 text-ship" />
              ) : (
                <Clock aria-hidden className="size-3.5 shrink-0" />
              )}
              {job.customer_paid ? "Customer paid" : "Customer not paid yet"}
            </span>
          )}
        </div>
      )}
      <span className="col-start-1 row-start-3 text-caption text-ink-2 md:col-start-3 md:row-start-1 md:text-sm">
        {staffOwedJobWords(job, currency).join(" · ")}
      </span>
      {job.override_reason && (
        <span className="col-span-2 col-start-1 row-start-4 text-right text-caption break-words text-ink-2 md:col-start-3 md:row-start-2">
          {`Set by staff: ${job.override_reason}`}
        </span>
      )}
    </li>
  );
}

/**
 * The Jobs tab on a partner's page: every job the workshop has or had, its order, what it's worth and
 * where its pay stands, newest hand-over first. Rows aren't links; the order is the one thing to open.
 */
export function StaffOwedJobsTab({ owed }: { owed: PartnerMoney["owed"] }) {
  if (owed.isPending) {
    return (
      <div role="status" aria-label="Loading this partner's jobs" className="flex flex-col gap-2">
        {[0, 1, 2].map((n) => (
          <div key={n} aria-hidden className="h-11 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  if (!owed.totals) {
    return <LoadFailure error={owed.error} fallback="This partner's jobs couldn't be loaded." onRetry={() => void owed.refetch()} />;
  }
  if (owed.items.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-ink-2">No jobs yet. A job shows here once this partner accepts one.</p>;
  }

  const { currency } = owed.totals;
  return (
    <>
      <ul className="flex flex-col md:divide-y md:divide-line">
        {owed.items.map((job) => (
          <JobRow key={job.assignment_id} job={job} currency={currency} />
        ))}
      </ul>
      <ListEnd list={owed} />
    </>
  );
}
