"use client";

import { useState } from "react";

import { cn } from "cn";

import { Freshness } from "@/components/data/freshness";
import { greeting } from "@/components/dashboard/greeting";
import { RangePicker } from "@/components/dashboard/range-picker";
import { useMe } from "@/components/session/session-gate";
import { DEFAULT_CHOICE, rangeWords, resolveRange, type RangeChoice } from "@/lib/dashboard/range";
import { dayKey } from "@/lib/format/dates";
import { useFormat } from "@/lib/format/use-format";
import { usePartnerCapacity, usePartnerSummary } from "@/lib/partner-dashboard/queries";
import { useNow } from "@/lib/use-now";

import { useWorkshop } from "../use-workshop";

import { CountTiles } from "./count-tiles";
import { OffersTile } from "./offers-tile";
import { RatingsTile } from "./ratings-tile";
import { ScoreTile } from "./score-tile";
import { StepsTile } from "./steps-tile";
import { WorkloadTile } from "./workload-tile";

/**
 * `/partner-portal/:partnerId/dashboard`: the workshop's work at a glance. The range is kept on the
 * page (a reload opens the last 30 days); tiles about now ignore it. Each tile loads and fails on its own.
 */
export function PartnerDashboardPage() {
  const { data: me } = useMe();
  const { partnerId, name } = useWorkshop();
  const { date, timeZone } = useFormat();
  // Read again every minute, so a page left open past midnight moves its range and greeting on.
  const now = new Date(useNow(60_000));
  const [choice, setChoice] = useState<RangeChoice>(DEFAULT_CHOICE);
  const range = resolveRange(choice, dayKey(now.toISOString(), timeZone));
  const words = rangeWords(choice);
  const summary = usePartnerSummary(partnerId, range);
  const capacity = usePartnerCapacity(partnerId, range);
  const busy = summary.isPlaceholderData || capacity.isPlaceholderData;
  const firstName = me ? (me.user.name.split(" ")[0] ?? me.user.name) : null;

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-title font-semibold">Dashboard</h1>
          <p className="text-sm text-ink-2">
            {firstName ? `${greeting(now, timeZone)}, ${firstName}.` : greeting(now, timeZone)}{" "}
            <span className="whitespace-nowrap">{name ? `${name} · ${date(now.toISOString())}` : date(now.toISOString())}</span>
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-end gap-1 md:ml-auto">
          <RangePicker choice={choice} onChange={setChoice} />
          {summary.dataUpdatedAt > 0 && <Freshness query={summary} />}
        </div>
      </div>

      <div
        aria-busy={busy}
        className={cn(
          "mt-4 grid grid-flow-row-dense grid-cols-2 gap-3.5 transition-opacity motion-reduce:transition-none md:grid-cols-6 lg:grid-cols-12",
          busy && "opacity-60",
        )}
      >
        {/* Reading order on a phone: the hero, the offers, then the counts. */}
        <WorkloadTile partnerId={partnerId} range={range} words={words} />
        <OffersTile />
        <CountTiles summary={summary.data} words={words} />
        <ScoreTile />
        <StepsTile summary={summary.data} />
        <RatingsTile />
      </div>
    </>
  );
}
