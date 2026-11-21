"use client";

import { ArrowUpRight, Clock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { PartnerJob } from "@/lib/api/schema-types";
import { partnerRoleAtLeast, usePartnerRole } from "@/lib/auth/permissions";
import { owedNow } from "@/lib/partner-earnings/labels";
import { usePartnerOwed } from "@/lib/partner-earnings/queries";
import { timeLeft } from "@/lib/partner-jobs/labels";
import { PAGE_SIZE, usePartnerJobs } from "@/lib/partner-jobs/queries";
import { useNow } from "@/lib/use-now";

import { partnerHref } from "./nav";
import { useWorkshop } from "./use-workshop";

/** How often the time left is worded again. */
const TICK_MS = 15_000;

// Orders' tile classes (`src/components/orders/tiles.tsx`), so the two pages read as one design.
const tileBox = "flex min-h-24 flex-col gap-1 rounded-[20px] bg-card p-3 text-left md:min-h-36 md:gap-1.5 md:px-5 md:py-[18px]";
const tileTitle = "text-caption font-medium text-ink-2";
const tileNumber = "text-2xl font-semibold tracking-[-0.04em] tabular-nums md:text-[34px] md:leading-tight";
const heroBox = "col-span-3 flex flex-col gap-1.5 rounded-[20px] bg-linear-120 from-lilac via-[#f4f1ff] to-[#e3dcfb] px-5 py-[18px] xl:col-span-1";
const grid = "grid grid-cols-3 gap-3 md:gap-3.5 xl:grid-cols-[1.7fr_1fr_1fr_1fr]";

const open = (job: PartnerJob, now: number) => job.expires_at === null || !timeLeft(job.expires_at, now).over;

/**
 * The tiles above the Jobs list: the offers waiting for an answer, and for admins and owners what the
 * next payout pays. Late and due soon join them once erp-api counts jobs (`backend-todos.md`).
 */
export function JobsTiles({ onReviewOffers }: { onReviewOffers: () => void }) {
  const { partnerId } = useWorkshop();
  const role = usePartnerRole(partnerId);
  const seesOwed = role !== undefined && partnerRoleAtLeast(role, "admin");

  return (
    <div className={grid}>
      <OffersTile onReview={onReviewOffers} />
      {seesOwed && <OwedTile partnerId={partnerId} />}
    </div>
  );
}

function OffersTile({ onReview }: { onReview: () => void }) {
  const { partnerId } = useWorkshop();
  // The same query as the Offers tab: one request for both.
  const offers = usePartnerJobs(partnerId, "offered");
  const now = useNow(TICK_MS);

  if (offers.isPending) {
    return (
      <div role="status" aria-label="Loading your offers" className="col-span-3 h-36 animate-pulse rounded-[20px] bg-lilac motion-reduce:animate-none xl:col-span-1" />
    );
  }

  const waiting = offers.items.filter((job) => open(job, now));
  const soonest = waiting
    .flatMap((job) => (job.expires_at ? [job.expires_at] : []))
    .sort()
    .at(0);
  // Only one page of offers is known: past it, the count is a floor.
  const count = offers.hasNextPage ? `${PAGE_SIZE}+` : String(waiting.length);

  return (
    <section aria-labelledby="offers-waiting" className={heroBox}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="offers-waiting" className="text-caption font-medium text-[#4d4570]">
            Waiting for your answer
          </h2>
          {offers.isError && offers.items.length === 0 ? (
            <div className="mt-1 flex flex-col items-start gap-2">
              <p className="text-sm text-ink-2">Couldn&apos;t load your offers.</p>
              <Button variant="secondary" onClick={() => void offers.refetch()}>
                Try again
              </Button>
            </div>
          ) : waiting.length === 0 && !offers.hasNextPage ? (
            <p className="mt-1 text-sm text-ink-2">None</p>
          ) : (
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-[34px] leading-tight font-semibold tracking-[-0.04em] tabular-nums">{count}</span>{" "}
              <span className="text-sm font-medium text-ink-2">{waiting.length === 1 && !offers.hasNextPage ? "offer" : "offers"}</span>
            </p>
          )}
        </div>
        {(waiting.length > 0 || offers.hasNextPage) && (
          <Button variant="secondary" className="rounded-full border-transparent" onClick={onReview}>
            Review
          </Button>
        )}
      </div>
      {soonest && <FirstRunsOut expiresAt={soonest} now={now} />}
    </section>
  );
}

/** When the first offer's time to answer is over; urgent under 2 hours, with the word and a clock. */
function FirstRunsOut({ expiresAt, now }: { expiresAt: string; now: number }) {
  const { text, urgent } = timeLeft(expiresAt, now);
  const left = text.replace(" left to answer", "");
  const words = `First runs out in ${left.charAt(0).toLowerCase()}${left.slice(1)}`;
  if (!urgent) return <p className="mt-auto text-sm text-[#4d4570]">{words}</p>;
  return (
    <p className="mt-auto inline-flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-warn">
      <Clock aria-hidden className="size-4 shrink-0" />
      <span>Urgent</span>
      <span>{words}</span>
    </p>
  );
}

/** What the next payout pays, opening Earnings. Only admins and owners may read it. */
function OwedTile({ partnerId }: { partnerId: string }) {
  const owed = usePartnerOwed(partnerId, { enabled: true, poll: false });

  if (owed.isPending) return <div role="status" aria-label="Loading what you're owed" className="h-24 animate-pulse rounded-[20px] bg-card motion-reduce:animate-none md:h-36" />;

  if (!owed.totals) {
    return (
      <section aria-labelledby="owed-now" className={tileBox}>
        <h2 id="owed-now" className={tileTitle}>
          Owed now
        </h2>
        <p className="text-sm text-ink-2">Couldn&apos;t load it.</p>
        <Button variant="secondary" className="self-start" onClick={() => void owed.refetch()}>
          Try again
        </Button>
      </section>
    );
  }

  return (
    <Link
      href={partnerHref(partnerId, "earnings")}
      className={`${tileBox} group transition-shadow hover:shadow-[0_0_0_1px_var(--color-line)] focus-visible:outline-2 focus-visible:outline-violet motion-reduce:transition-none`}
    >
      <span className={`flex items-center justify-between ${tileTitle}`}>
        Owed now
        <span aria-hidden className="hidden size-7 place-items-center rounded-full border border-line text-ink group-hover:bg-ground md:grid">
          <ArrowUpRight className="size-3.5" />
        </span>
      </span>
      <span className={`${tileNumber} text-ink max-md:text-base`}>{owedNow(owed.totals)}</span>
    </Link>
  );
}
