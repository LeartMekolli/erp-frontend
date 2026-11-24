"use client";

import Link from "next/link";

import { CountdownRing } from "@/components/charts/countdown-ring";
import { Tile } from "@/components/dashboard/tile";
import { Button } from "@/components/ui/button";
import type { PartnerJob } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { jobTitle, piecesText, timeLeft } from "@/lib/partner-jobs/labels";

import { useOffersWaiting } from "../jobs-tiles";
import { partnerHref } from "../nav";
import { jobHref } from "../offer-actions";
import { useWorkshop } from "../use-workshop";

/** How many offers the tile lists; "All offers" opens the rest on Jobs. */
const SHOWN = 3;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The share of an offer's time to answer still to go, 0 to 1; null for an offer with no deadline. */
export function offerLeft(job: Pick<PartnerJob, "offered_at" | "expires_at">, now: number): number | null {
  if (job.expires_at === null) return null;
  const end = Date.parse(job.expires_at);
  const whole = end - Date.parse(job.offered_at);
  if (whole <= 0) return 0;
  return Math.min(Math.max((end - now) / whole, 0), 1);
}

/** The time left, short enough for the ring: "2d", "5h", "30m", "<1m". */
function shortLeft(expiresAt: string, now: number): string {
  const left = Date.parse(expiresAt) - now;
  if (left >= DAY) return `${Math.floor(left / DAY)}d`;
  if (left >= HOUR) return `${Math.floor(left / HOUR)}h`;
  if (left >= MINUTE) return `${Math.floor(left / MINUTE)}m`;
  return "<1m";
}

const deadline = (job: PartnerJob) => (job.expires_at === null ? Number.POSITIVE_INFINITY : Date.parse(job.expires_at));

/**
 * The offers waiting for an answer, soonest deadline first, each with a ring of the time it has left.
 * The same query and count as the Jobs page, so an offer that runs out leaves both at the same tick.
 */
export function OffersTile() {
  const { partnerId } = useWorkshop();
  const { offers, waiting, count, now } = useOffersWaiting();
  const format = useFormat();
  const shown = waiting.toSorted((a, b) => deadline(a) - deadline(b)).slice(0, SHOWN);
  const more = waiting.length > SHOWN || offers.hasNextPage;

  return (
    <Tile
      span={4}
      tone="lilac"
      title="Offers waiting for you"
      aside={offers.isSuccess ? <span className="text-[22px] leading-none font-semibold tabular-nums">{count}</span> : undefined}
    >
      {offers.isPending ? (
        <p role="status" className="mt-3 text-sm text-[#4d4570]">
          Loading your offers…
        </p>
      ) : offers.isError && offers.items.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm text-ink-2">Couldn&apos;t load your offers.</p>
          <Button variant="secondary" onClick={() => void offers.refetch()}>
            Try again
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-3 text-sm text-[#4d4570]">No offers waiting.</p>
      ) : (
        <>
          <ul role="list" className="mt-3 flex flex-col gap-3">
            {shown.map((job) => {
              const left = offerLeft(job, now);
              const due = job.due_on ? ` · due ${format.day(job.due_on)}` : "";
              return (
                <li key={job.id} className="flex min-w-0 items-center gap-3">
                  {job.expires_at !== null && left !== null ? (
                    <CountdownRing left={left} text={shortLeft(job.expires_at, now)} />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{jobTitle(job)}</p>
                    <p className="truncate text-caption text-[#4d4570]">
                      {`${piecesText(job.quantity)}${due} · ${format.money(job.cost, format.currency)}`}
                    </p>
                    <p className="text-caption text-[#4d4570]">{job.expires_at === null ? "No deadline" : timeLeft(job.expires_at, now).text}</p>
                  </div>
                  <Link
                    href={jobHref(partnerId, job.id)}
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-caption font-semibold text-ink hover:bg-[#f7f6fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet pointer-coarse:py-3"
                  >
                    Open<span className="sr-only">{` ${jobTitle(job)}`}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {more ? (
            <Link
              href={partnerHref(partnerId, "jobs")}
              className="mt-3 self-start text-caption font-semibold text-violet-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
            >
              All offers
            </Link>
          ) : null}
        </>
      )}
    </Tile>
  );
}
