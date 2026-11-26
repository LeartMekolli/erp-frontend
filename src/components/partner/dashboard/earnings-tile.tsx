"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Columns } from "@/components/charts/columns";
import { compactAxis } from "@/components/charts/scale-helpers";
import { CHART } from "@/components/charts/tokens";
import { ChangeLine } from "@/components/dashboard/change-line";
import { bucketLabel, moneyChange } from "@/components/dashboard/headline";
import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import type { PartnerSummary } from "@/lib/api/schema-types";
import { previousRangeWords } from "@/lib/dashboard/range";
import { formatMoney, signOf } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { owedNow } from "@/lib/partner-earnings/labels";
import { usePartnerOwed, usePartnerPayouts } from "@/lib/partner-earnings/queries";

import { partnerHref } from "../nav";
import { useWorkshop } from "../use-workshop";

import type { SummaryFailure } from "./summary-failure";

/**
 * The three parts of what was earned, bottom to top, as erp-api splits them (`partner-summary-response.ts:24-31`).
 * Steps of the chart ramp that stay apart on the dark tile, each also named in the legend and the table.
 */
const PARTS = [
  { key: "paid", total: "paid_total", name: "Paid out", color: CHART.ramp[2] },
  { key: "pending", total: "pending_total", name: "On its way", color: CHART.ramp[4] },
  { key: "owed", total: "owed_total", name: "Owed", color: CHART.ramp[0] },
] as const;

const LINK =
  "inline-flex items-center gap-1 text-caption font-semibold text-[#b7aaff] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * The dark hero for admins and owners: what the workshop earned in the range against the range before, each
 * bucket split into paid out, on its way and still owed, then what it's owed now, what's not yet owed and the
 * last payout. erp-api leaves the money out below admin, and the page mounts this only for admins and owners,
 * so a failed summary shows its error here rather than a gap where the hero was.
 */
export function EarningsTile({ summary, words, failure }: { summary: PartnerSummary | undefined; words: string; failure?: SummaryFailure }) {
  const { partnerId } = useWorkshop();
  const title = `Earned · ${words}`;
  const aside = (
    <Link href={partnerHref(partnerId, "earnings")} className={LINK}>
      Earnings
      <ArrowUpRight aria-hidden className="size-3.5" />
    </Link>
  );

  if (!summary || summary.earned === undefined || summary.currency === undefined || summary.series === undefined) {
    return (
      <Tile span={8} rows={2} tone="dark" title={title} aside={aside}>
        {failure && !summary ? (
          <div className="mt-3 rounded-[12px] bg-white px-3">
            <LoadFailure error={failure.error} fallback="Couldn't load what you earned." onRetry={failure.retry} />
          </div>
        ) : (
          <p role="status" className="mt-3 text-sm text-[#b9b6c9]">
            Loading what you earned…
          </p>
        )}
      </Tile>
    );
  }

  const { earned, currency, series, range } = summary;
  const previous = summary.previous_earned ?? null;
  const nothing = signOf(earned) !== 1;
  // Heights only: every figure on screen is erp-api's string, formatted (as `partner-tiles.tsx:90`).
  const data = series.map((point) => ({
    key: point.start,
    label: bucketLabel(point.start, range.bucket),
    values: PARTS.map((part) => Number(point[part.key])),
  }));

  return (
    <Tile span={8} rows={2} tone="dark" title={title} aside={aside}>
      <p className="mt-3 text-[clamp(40px,13vw,58px)] leading-none font-semibold tracking-[-0.04em] tabular-nums">{formatMoney(earned, currency)}</p>
      <ChangeLine
        change={moneyChange(earned, previous, "up")}
        previous={previousRangeWords(range)}
        before={previous === null ? null : formatMoney(previous, currency)}
        tone="dark"
      />
      <div className="mt-3 min-w-0 flex-1">
        {nothing ? (
          <p className="py-10 text-center text-sm text-[#b9b6c9]">{`Nothing earned in the ${words}.`}</p>
        ) : (
          <Columns
            label={`Earned per ${range.bucket === "month" ? "month" : range.bucket === "week" ? "week" : "day"}, ${words}`}
            data={data}
            series={PARTS.map(({ name, color }) => ({ name, color }))}
            height={200}
            format={(value) => formatMoney(value.toFixed(2), currency)}
            axis={(value) => compactAxis(value, currency)}
            tone="dark"
            legend={false}
          />
        )}
      </div>
      <ul role="list" aria-label="Earned in the range" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-[#b9b6c9]">
        {PARTS.map((part) => (
          <li key={part.key} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2.5 rounded-[3px]" style={{ backgroundColor: part.color }} />
            {part.name}{" "}
            <span className="font-semibold text-white tabular-nums">{formatMoney(summary[part.total] ?? "0", currency)}</span>
          </li>
        ))}
      </ul>
      <OwedLine />
    </Tile>
  );
}

/** What's owed now and not yet, and the last payout made, each loading and failing on its own. */
function OwedLine() {
  const { partnerId } = useWorkshop();
  const { date } = useFormat();
  const owed = usePartnerOwed(partnerId, { enabled: true, poll: false });
  const payouts = usePartnerPayouts(partnerId, true);
  const lastPaid = payouts.items.find((payout) => payout.status === "paid");

  return (
    <div className="mt-3 border-t border-white/12 pt-3">
      {owed.totals ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-caption text-[#b9b6c9]">Owed now</dt>
            <dd className="m-0 text-base font-semibold tabular-nums">{owedNow(owed.totals)}</dd>
          </div>
          <div>
            <dt className="text-caption text-[#b9b6c9]">Not yet owed</dt>
            <dd className="m-0 text-base font-semibold tabular-nums">{formatMoney(owed.totals.not_yet_total, owed.totals.currency)}</dd>
          </div>
          <div>
            <dt className="text-caption text-[#b9b6c9]">Last payout</dt>
            <dd className="m-0 text-base font-semibold tabular-nums">
              {payouts.isPending
                ? "…"
                : lastPaid
                  ? `${formatMoney(lastPaid.amount, lastPaid.currency)} · ${date(lastPaid.settled_at ?? lastPaid.created_at)}`
                  : payouts.isError
                    ? "Couldn't load"
                    : "None yet"}
            </dd>
          </div>
        </dl>
      ) : owed.isError ? (
        <div className="rounded-[12px] bg-white px-3">
          <LoadFailure error={owed.error} fallback="Couldn't load what you're owed." onRetry={() => void owed.refetch()} />
        </div>
      ) : (
        <p role="status" className="text-sm text-[#b9b6c9]">
          Loading what you&apos;re owed…
        </p>
      )}
    </div>
  );
}
