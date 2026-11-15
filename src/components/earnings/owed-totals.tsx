"use client";

import { LoadFailure } from "@/components/data/load-failure";
import { formatMoney } from "@/lib/format/money";
import { jobsCount, owedNow } from "@/lib/partner-earnings/labels";
import type { OwedTotals as Totals } from "@/lib/payouts/poll";

const tileBox = "flex min-h-24 flex-col gap-1 rounded-[20px] p-4 md:min-h-32 md:gap-1.5 md:px-5 md:py-[18px]";
const tileTitle = "text-caption font-medium";
const tileNumber = "text-2xl font-semibold tracking-[-0.04em] tabular-nums md:text-[34px] md:leading-tight";

export type Audience = "partner" | "staff";

const WORDS: Record<Audience, { region: string; loading: string; failed: string }> = {
  partner: { region: "What you're owed", loading: "Loading what you're owed", failed: "What you're owed couldn't be loaded." },
  staff: { region: "What's owed", loading: "Loading what's owed", failed: "What's owed couldn't be loaded." },
};

/**
 * The two numbers at the top of Earnings: what the next payout would pay, and what jobs still being made
 * will be worth. Both come from erp-api and cover every page. Staff decide when to pay, so a partner
 * reads that in a line below, and staff have no such line.
 */
export function OwedTotals({
  owed,
  audience,
}: {
  owed: { totals: Totals | undefined; isError: boolean; error: unknown; refetch: () => unknown };
  audience: Audience;
}) {
  const { totals } = owed;
  const words = WORDS[audience];

  if (owed.isError && !totals) {
    return <LoadFailure error={owed.error} fallback={words.failed} onRetry={() => void owed.refetch()} />;
  }

  if (!totals) {
    return (
      <div role="status" aria-label={words.loading} className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((n) => (
          <div key={n} aria-hidden className="min-h-24 animate-pulse rounded-[20px] bg-card motion-reduce:animate-none md:min-h-32" />
        ))}
      </div>
    );
  }

  return (
    <section aria-label={words.region} className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`${tileBox} bg-lilac text-violet-ink`}>
          <p className={tileTitle}>Owed now</p>
          <p className={`${tileNumber} text-ink`}>{owedNow(totals)}</p>
        </div>
        <div className={`${tileBox} bg-card`}>
          <p className={`${tileTitle} text-ink-2`}>Still being earned</p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className={tileNumber}>{formatMoney(totals.not_yet_total, totals.currency)}</span>
            {totals.not_yet_count > 0 && <span className="text-sm text-ink-2">{`· ${jobsCount(totals.not_yet_count)}`}</span>}
          </p>
        </div>
      </div>
      {audience === "partner" && <p className="px-1 text-sm text-ink-2">Paid when the workspace sends a payout.</p>}
    </section>
  );
}
