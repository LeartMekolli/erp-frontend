"use client";

import { notFound, useSearchParams } from "next/navigation";

import { cn } from "cn";

import { Freshness } from "@/components/data/freshness";
import { LoadFailure } from "@/components/data/load-failure";
import { useMe } from "@/components/session/session-gate";
import { can } from "@/lib/auth/permissions";
import { useDashboardRange } from "@/lib/dashboard/queries";
import { parseRange, rangeWords, resolveRange } from "@/lib/dashboard/range";
import { dayKey } from "@/lib/format/dates";
import { useFormat } from "@/lib/format/use-format";
import { useNow } from "@/lib/use-now";

import { AttentionTile } from "./attention-tile";
import { BriefingTile } from "./briefing-tile";
import { HeroTile } from "./hero-tile";
import { KpiTiles } from "./kpi-tiles";
import { PartnerTiles } from "./partner-tiles";
import { ProductionTiles } from "./production-tiles";
import { RangePicker } from "./range-picker";
import { SalesTiles } from "./sales-tiles";

/** "Good morning" before noon, "Good afternoon" before six, then "Good evening", in the workspace's time zone. */
function greeting(now: Date, timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** `/dashboard`: how the business is doing over any range, against the range before it. Needs `report.read`. */
export function DashboardPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "report.read")) notFound();
  return <Dashboard firstName={me.user.name.split(" ")[0] ?? me.user.name} />;
}

function Dashboard({ firstName }: { firstName: string }) {
  const { date, timeZone } = useFormat();
  // Read again every minute, so a page left open past midnight moves its ranges, the heatmap's today and the greeting on.
  const now = new Date(useNow(60_000));
  const choice = parseRange(useSearchParams());
  const today = dayKey(now.toISOString(), timeZone);
  const days = resolveRange(choice, today);
  const range = useDashboardRange(days);
  const words = rangeWords(choice);

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-title font-semibold">Dashboard</h1>
          <p className="text-sm text-ink-2">
            {`${greeting(now, timeZone)}, ${firstName}.`} <span className="whitespace-nowrap">{date(now.toISOString())}</span>
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-end gap-1 md:ml-auto">
          <RangePicker />
          {range.dataUpdatedAt > 0 && <Freshness query={range} />}
        </div>
      </div>

      {range.data ? (
        <div
          aria-busy={range.isPlaceholderData}
          className={cn(
            "mt-4 grid grid-flow-row-dense grid-cols-2 gap-3.5 transition-opacity motion-reduce:transition-none md:grid-cols-6 lg:grid-cols-12",
            range.isPlaceholderData && "opacity-60",
          )}
        >
          <HeroTile range={range.data} words={words} />
          {/* Attention before the briefing: a phone reads hero, attention, then the KPIs (spec, Responsive). */}
          <AttentionTile />
          <BriefingTile />
          <KpiTiles range={range.data} />
          <ProductionTiles range={range.data} />
          <PartnerTiles range={range.data} />
          <SalesTiles range={range.data} today={today} />
        </div>
      ) : range.isError ? (
        <div className="mt-4 rounded-[20px] bg-card px-5 py-4">
          <LoadFailure error={range.error} fallback="Couldn't load the dashboard." onRetry={() => void range.refetch()} />
        </div>
      ) : (
        <p role="status" className="mt-4 text-sm text-ink-2">
          Loading the dashboard…
        </p>
      )}
    </>
  );
}
