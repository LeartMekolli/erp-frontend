"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { ChangeLine } from "@/components/dashboard/change-line";
import { moneyChange } from "@/components/dashboard/headline";
import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import type { PartnerSummary } from "@/lib/api/schema-types";
import { previousRangeWords } from "@/lib/dashboard/range";
import { formatMoney } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { owedNow, PAYOUT_STATUS } from "@/lib/partner-earnings/labels";
import { usePartnerOwed, usePartnerPayouts } from "@/lib/partner-earnings/queries";

import { partnerHref } from "../nav";
import { useWorkshop } from "../use-workshop";

import type { SummaryFailure } from "./summary-failure";

/** How many payouts the tile lists. */
const SHOWN = 3;

/**
 * What the workshop earned in the range against the range before, then what it's owed now and what's
 * still being earned. Only when erp-api sent the money: it leaves it out below admin, and so does this.
 * The page mounts it only for admins and owners, so a failed summary shows its error here rather than
 * a gap where the money was.
 */
export function EarnedTile({ summary, words, failure }: { summary: PartnerSummary | undefined; words: string; failure?: SummaryFailure }) {
  if (!summary) {
    if (!failure) return null;
    return (
      <Tile span={4} title={`Earned · ${words}`}>
        <LoadFailure error={failure.error} fallback="Couldn't load what you earned." onRetry={failure.retry} />
      </Tile>
    );
  }
  const { earned, previous_earned: previous, currency } = summary;
  if (earned === undefined || currency === undefined) return null;
  return <Earned earned={earned} previous={previous ?? null} currency={currency} range={summary.range} words={words} />;
}

function Earned({
  earned,
  previous,
  currency,
  range,
  words,
}: {
  earned: string;
  previous: string | null;
  currency: string;
  range: PartnerSummary["range"];
  words: string;
}) {
  const { partnerId } = useWorkshop();
  const owed = usePartnerOwed(partnerId, { enabled: true, poll: false });

  return (
    <Tile
      span={4}
      title={`Earned · ${words}`}
      aside={
        <Link
          href={partnerHref(partnerId, "earnings")}
          className="inline-flex items-center gap-1 text-caption font-semibold text-violet-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
        >
          Earnings
          <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      }
    >
      <p className="mt-1 text-[34px] leading-tight font-semibold tracking-[-0.04em] tabular-nums">{formatMoney(earned, currency)}</p>
      <ChangeLine
        change={moneyChange(earned, previous, "up")}
        previous={previousRangeWords(range)}
        before={previous === null ? null : formatMoney(previous, currency)}
        tone="light"
      />
      <div className="mt-auto pt-3">
        {owed.totals ? (
          <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div>
              <dt className="text-caption text-ink-2">Owed now</dt>
              <dd className="m-0 text-base font-semibold tabular-nums">{owedNow(owed.totals)}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-2">Not yet owed</dt>
              <dd className="m-0 text-base font-semibold tabular-nums">{formatMoney(owed.totals.not_yet_total, owed.totals.currency)}</dd>
            </div>
          </dl>
        ) : owed.isError ? (
          <LoadFailure error={owed.error} fallback="Couldn't load what you're owed." onRetry={() => void owed.refetch()} />
        ) : (
          <p role="status" className="text-sm text-ink-2">
            Loading what you&apos;re owed…
          </p>
        )}
      </div>
    </Tile>
  );
}

/** The newest payouts, with the status in words when one isn't simply paid. Admins and owners only. */
export function PayoutsTile() {
  const { partnerId } = useWorkshop();
  const payouts = usePartnerPayouts(partnerId, true);
  const { date } = useFormat();
  const shown = payouts.items.slice(0, SHOWN);

  return (
    <Tile span={3} title="Latest payouts">
      {payouts.isPending ? (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Loading your payouts…
        </p>
      ) : payouts.isError && shown.length === 0 ? (
        <LoadFailure error={payouts.error} fallback="Couldn't load your payouts." onRetry={() => void payouts.refetch()} />
      ) : shown.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">No payouts yet.</p>
      ) : (
        <ul role="list" className="mt-3 flex flex-col gap-2.5">
          {shown.map((payout) => (
            <li key={payout.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold tabular-nums">{formatMoney(payout.amount, payout.currency)}</span>
                {payout.status === "paid" ? null : (
                  <span className={payout.status === "pending" ? "block text-caption text-ink-2" : "block text-caption font-medium text-late-ink"}>
                    {PAYOUT_STATUS[payout.status]}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-caption text-ink-2">{date(payout.settled_at ?? payout.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
