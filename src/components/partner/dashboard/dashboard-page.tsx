"use client";

import { useState } from "react";

import { cn } from "cn";

import { greeting } from "@/components/dashboard/greeting";
import { RangePicker } from "@/components/dashboard/range-picker";
import { Freshness } from "@/components/data/freshness";
import { LoadFailure } from "@/components/data/load-failure";
import { useMe } from "@/components/session/session-gate";
import { usePartnerMe } from "@/components/session/use-partner-me";
import { partnerRoleAtLeast, usePartnerRole } from "@/lib/auth/permissions";
import { DEFAULT_CHOICE, rangeWords, resolveRange, type RangeChoice } from "@/lib/dashboard/range";
import { dayKey } from "@/lib/format/dates";
import { useFormat } from "@/lib/format/use-format";
import { usePartnerCapacity, usePartnerSummary } from "@/lib/partner-dashboard/queries";
import { useNow } from "@/lib/use-now";

import { useWorkshop } from "../use-workshop";

import { ActivityTile } from "./activity-tile";
import { CountTiles } from "./count-tiles";
import { EarningsTile } from "./earnings-tile";
import { PayoutsTile } from "./money-tiles";
import { OffersTile } from "./offers-tile";
import { RatingsTile } from "./ratings-tile";
import { ScoreTile } from "./score-tile";
import { SetupTile } from "./setup-tile";
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
  const today = dayKey(now.toISOString(), timeZone);
  const range = resolveRange(choice, today);
  const words = rangeWords(choice);
  const summary = usePartnerSummary(partnerId, range);
  const capacity = usePartnerCapacity(partnerId, range);
  const busy = summary.isPlaceholderData || capacity.isPlaceholderData;
  // While a range loads, the titles keep the words of the range whose numbers are still on screen.
  const [settledWords, setSettledWords] = useState(words);
  if (!busy && settledWords !== words) setSettledWords(words);
  const shownWords = busy ? settledWords : words;
  const partnerMe = usePartnerMe();
  const role = usePartnerRole(partnerId);
  const seesMoney = role !== undefined && partnerRoleAtLeast(role, "admin");
  const summaryFailure = summary.isError && !summary.data ? { error: summary.error, retry: () => void summary.refetch() } : undefined;
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

      {/* The tiles wait for the person's role, so the money tiles don't pop in and move the others. */}
      {partnerMe.data ? (
        <div
          aria-busy={busy}
          className={cn(
            "mt-4 grid grid-flow-row-dense grid-cols-2 gap-3.5 transition-opacity motion-reduce:transition-none md:grid-cols-6 lg:grid-cols-12",
            busy && "opacity-60",
          )}
        >
          {/* Reading order on a phone: the hero, the offers, then the counts. Below admin there is no money at all:
              members get the workload as their hero, admins and owners their earnings, with the workload further down. */}
          {seesMoney ? (
            <EarningsTile summary={summary.data} words={shownWords} failure={summaryFailure} />
          ) : (
            <WorkloadTile partnerId={partnerId} range={range} words={shownWords} today={today} />
          )}
          <OffersTile />
          <CountTiles summary={summary.data} words={shownWords} failure={summaryFailure} />
          <ScoreTile />
          <StepsTile summary={summary.data} failure={summaryFailure} />
          <RatingsTile />
          {seesMoney ? <WorkloadTile partnerId={partnerId} range={range} words={shownWords} today={today} variant="tile" /> : null}
          {seesMoney ? <PayoutsTile /> : null}
          <SetupTile />
          <ActivityTile wide={!seesMoney} />
        </div>
      ) : partnerMe.isError ? (
        <div className="mt-4 rounded-[20px] bg-card px-5 py-4">
          <LoadFailure error={partnerMe.error} fallback="Couldn't load the dashboard." onRetry={() => void partnerMe.refetch()} />
        </div>
      ) : (
        <p role="status" className="mt-4 text-sm text-ink-2">
          Loading the dashboard…
        </p>
      )}
    </>
  );
}
