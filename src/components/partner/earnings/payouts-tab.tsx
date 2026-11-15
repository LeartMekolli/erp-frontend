"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import type { PartnerPayout, PayoutStatus } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { formatMoney } from "@/lib/format/money";
import { jobsCount, PAYOUT_STATUS, payoutJobAmount } from "@/lib/partner-earnings/labels";
import type { usePartnerPayouts } from "@/lib/partner-earnings/queries";
import { piecesText } from "@/lib/partner-jobs/labels";

const DOT: Record<PayoutStatus, string> = { pending: "bg-violet", paid: "bg-ship", failed: "bg-late", reversed: "bg-late" };

/** One payout: a row that opens in place to list the jobs it paid for. erp-api has no route for one payout. */
function PayoutRow({ payout }: { payout: PartnerPayout }) {
  const [open, setOpen] = useState(false);
  const jobsId = useId();
  const { date } = useFormat();

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={jobsId}
        onClick={() => setOpen((was) => !was)}
        className="grid min-h-11 w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-ground focus-visible:outline-2 focus-visible:outline-violet md:grid-cols-[minmax(0,1fr)_8rem_7rem_5rem_auto]"
      >
        <span className="flex items-center gap-2 font-medium">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[payout.status])} />
          {PAYOUT_STATUS[payout.status]}
        </span>
        <span className="row-start-2 text-caption text-ink-2 md:row-start-auto md:text-sm">{date(payout.settled_at ?? payout.created_at)}</span>
        <span className="col-start-2 row-start-1 text-right font-semibold tabular-nums md:col-start-auto md:row-start-auto">
          {formatMoney(payout.amount, payout.currency)}
        </span>
        <span className="col-start-2 row-start-2 text-right text-caption text-ink-2 md:col-start-auto md:row-start-auto md:text-sm">
          {jobsCount(payout.jobs.length)}
        </span>
        <ChevronDown aria-hidden className={cn("hidden size-4 text-ink-2 transition-transform motion-reduce:transition-none md:block", open && "rotate-180")} />
      </button>
      {open && (
        <ul id={jobsId} aria-label="Jobs this payout paid for" className="mb-2 ml-6 flex flex-col gap-1 border-l border-line pl-3 md:ml-7">
          {payout.jobs.map((job) => (
            <li key={job.assignment_id} className="flex items-baseline justify-between gap-3 py-1 text-sm">
              <span className="min-w-0 truncate text-ink-2">{`${job.product?.name ?? "Job"} · ${piecesText(job.quantity)}`}</span>
              <span className="shrink-0 tabular-nums">{payoutJobAmount(job.amount, payout.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The Payouts tab: newest first, loading more as it scrolls. */
export function PayoutsTab({ payouts }: { payouts: ReturnType<typeof usePartnerPayouts> }) {
  if (payouts.isPending) {
    return (
      <div role="status" aria-label="Loading your payouts" className="flex flex-col gap-2">
        {[0, 1, 2].map((n) => (
          <div key={n} aria-hidden className="h-11 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  if (payouts.isError && payouts.items.length === 0) {
    return <LoadFailure error={payouts.error} fallback="Your payouts couldn't be loaded." onRetry={() => void payouts.refetch()} />;
  }
  if (payouts.items.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-ink-2">No payouts yet. The workspace pays what you&apos;re owed in one transfer.</p>;
  }
  return (
    <>
      <ul className="flex flex-col md:divide-y md:divide-line">
        {payouts.items.map((payout) => (
          <PayoutRow key={payout.id} payout={payout} />
        ))}
      </ul>
      <ListEnd list={payouts} />
    </>
  );
}
