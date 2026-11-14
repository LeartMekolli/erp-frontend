"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/order-detail/load-failure";
import type { PartnerJob } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { jobTitle, piecesText, timeLeft } from "@/lib/partner-jobs/labels";
import { usePartnerJobs } from "@/lib/partner-jobs/queries";
import { useNow } from "@/lib/use-now";

import { usePartnerNotice } from "./notice";
import { jobHref, OfferActions } from "./offer-actions";
import { TimeLeft } from "./time-left";
import { useWorkshop } from "./use-workshop";

/** How often the time left is worded again. */
const TICK_MS = 15_000;

/** An offer whose deadline has passed: erp-api lets it go, so the box does too. */
const ranOut = (job: PartnerJob, now: number) => job.expires_at !== null && timeLeft(job.expires_at, now).over;

/**
 * The offers waiting for the workshop's answer, above the Jobs tabs. Nothing
 * while they load or when there are none; a retry when they can't be loaded.
 * An offer that runs out while it's shown leaves the box and is announced
 * once, each time it's offered.
 */
export function OffersBox() {
  const { partnerId } = useWorkshop();
  const offers = usePartnerJobs(partnerId, "offered");
  const now = useNow(TICK_MS);
  const { announce } = usePartnerNotice();
  const headingId = useId();
  const shown = useRef(new Set<string>());
  const gone = useRef(new Set<string>());
  // The offer holding focus, its decline dialog included: React's focus events come up through the dialog's portal.
  const focused = useRef<string | null>(null);

  const open = offers.items.filter((job) => !ranOut(job, now));
  const over = offers.items.filter((job) => ranOut(job, now));

  useEffect(() => {
    for (const job of over) {
      if (!shown.current.has(job.id) || gone.current.has(job.id)) continue;
      gone.current.add(job.id);
      // Focus that was in the offer fell to the page with it: bring it to the notice.
      announce(`Time ran out on ${jobTitle(job)}.`, { focus: focused.current === job.id });
      if (focused.current === job.id) focused.current = null;
    }
    for (const job of open) {
      shown.current.add(job.id);
      gone.current.delete(job.id);
    }
  });

  // The offers keep counting down while they can't be loaded: say so, with a way to try again.
  if (offers.isError && offers.items.length === 0) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-1 rounded-2xl border border-lilac-2 bg-card px-4 py-4 sm:px-5">
        <h2 id={headingId} className="text-base font-semibold text-ink">
          Waiting for your answer
        </h2>
        <LoadFailure error={offers.error} fallback="Your offers couldn't be loaded." onRetry={() => void offers.refetch()} />
      </section>
    );
  }

  if (open.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1 rounded-2xl border border-lilac-2 bg-card px-4 py-4 sm:px-5">
      <h2 id={headingId} className="text-base font-semibold text-ink">{`Waiting for your answer · ${open.length}`}</h2>
      <ul className="flex flex-col divide-y divide-line">
        {open.map((job) => (
          <Offer
            key={job.id}
            job={job}
            partnerId={partnerId}
            now={now}
            onFocus={() => (focused.current = job.id)}
            onBlur={() => (focused.current = null)}
          />
        ))}
      </ul>
      <ListEnd list={offers} more="Show more offers" auto={false} />
    </section>
  );
}

function Offer({
  job,
  partnerId,
  now,
  onFocus,
  onBlur,
}: {
  job: PartnerJob;
  partnerId: string;
  now: number;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const format = useFormat();
  const pay = `You're paid ${format.money(job.cost, format.currency)}`;
  return (
    <li
      onFocus={onFocus}
      onBlur={onBlur}
      className="relative flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-semibold break-words text-ink">
          {/* The whole card opens the job; the buttons sit above the link's area. */}
          <Link
            href={jobHref(partnerId, job.id)}
            className="rounded-sm after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          >
            {jobTitle(job)}
          </Link>
          <span className="font-normal text-ink-2">{` · ${piecesText(job.quantity)}`}</span>
        </p>
        <p className="text-sm text-ink-2">{job.due_on ? `Due ${format.day(job.due_on)} · ${pay}` : pay}</p>
        {job.expires_at && <TimeLeft expiresAt={job.expires_at} now={now} />}
      </div>
      <div className="relative z-10 shrink-0">
        <OfferActions job={job} />
      </div>
    </li>
  );
}
