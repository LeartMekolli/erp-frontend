"use client";

import { useState } from "react";

import { cn } from "cn";

import { CapacityChart } from "@/components/charts/capacity-chart";
import { LoadFailure } from "@/components/data/load-failure";
import { bucketLabel } from "@/components/dashboard/headline";
import { Tile } from "@/components/dashboard/tile";
import type { CapacityRow } from "@/lib/api/schema-types";
import { usePartnerCapacity, type DayRange } from "@/lib/partner-dashboard/queries";

import { capacityWords, workloadSteps } from "./workload";

/**
 * The dark hero (members), or a light tile under the earnings hero (admins and owners), as the dashboards
 * design had it.
 */
const LOOKS = {
  hero: {
    span: 8,
    rows: 2,
    tone: "dark",
    chart: "dark",
    height: 220,
    figure: "text-[clamp(40px,13vw,58px)]",
    muted: "text-[#b9b6c9]",
    over: "text-[#ffd27a]",
    legend: "text-[#9e9bb0]",
    load: "bg-[#b7aaff]",
    capacity: "bg-[#9e9bb0]",
    chip: "min-h-8 rounded-full px-3 text-caption text-[#b9b6c9] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b7aaff] pointer-coarse:min-h-11",
    chipOn: "bg-white/12 font-medium text-white",
  },
  tile: {
    span: 6,
    rows: undefined,
    tone: "plain",
    chart: "light",
    height: 160,
    figure: "text-[34px]",
    muted: "text-ink-2",
    over: "text-warn",
    legend: "text-ink-2",
    load: "bg-violet",
    capacity: "bg-[#8d8a9c]",
    chip: "min-h-8 rounded-full px-3 text-caption text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet pointer-coarse:min-h-11",
    chipOn: "bg-ink font-medium text-white hover:text-white",
  },
} as const;

const NOTHING_KEPT = "No workload recorded yet. AMI records it each night for the steps you can do.";
const dayLabel = (iso: string) => bucketLabel(iso, "day");
/** The calendar day before `day` (`YYYY-MM-DD`). */
const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Pieces waiting at the busiest step against the capacity the partner set, as erp-api keeps it each night.
 * Chips switch the step. Nothing here is money, so every role sees it: as the hero for members, as a tile
 * under the earnings hero for admins and owners.
 */
export function WorkloadTile({
  partnerId,
  range,
  words,
  today,
  variant = "hero",
}: {
  partnerId: string;
  range: DayRange;
  words: string;
  today: string;
  variant?: keyof typeof LOOKS;
}) {
  const look = LOOKS[variant];
  const capacity = usePartnerCapacity(partnerId, range);
  const [picked, setPicked] = useState<string | null>(null);
  const steps = capacity.data ? workloadSteps(capacity.data) : [];
  const shown = steps.find((step) => step.key === picked) ?? steps[0];

  if (!capacity.data) {
    return (
      <Tile span={look.span} rows={look.rows} tone={look.tone} title={`Workload · ${words}`}>
        {capacity.isError ? (
          <div className="mt-3 rounded-[12px] bg-white px-3">
            <LoadFailure error={capacity.error} fallback="Couldn't load the workload." onRetry={() => void capacity.refetch()} />
          </div>
        ) : (
          <p role="status" className={cn("mt-3 text-sm", look.muted)}>
            Loading the workload…
          </p>
        )}
      </Tile>
    );
  }

  if (!shown) {
    return (
      <Tile span={look.span} rows={look.rows} tone={look.tone} title={`Workload · ${words}`}>
        <div className="mt-3 min-w-0 flex-1">
          <CapacityChart label={`Workload, ${words}`} points={[]} capacityWords={String} dateLabel={dayLabel} height={look.height} tone={look.chart} empty={NOTHING_KEPT} />
        </div>
      </Tile>
    );
  }

  const { latest } = shown;
  // Each day in the unit it was set in that day: a step can change from per day to per week.
  const asSet = (amount: number, period?: CapacityRow["capacity_period"]) => capacityWords(amount, period ?? latest.capacity_period);
  const over = latest.capacity > 0 && latest.load > latest.capacity;
  // erp-api keeps the row at 02:00 UTC, so yesterday's can be the newest; older than that, the figure says its day.
  const on = latest.date < dayBefore(today) ? ` on ${dayLabel(latest.date)}` : "";

  return (
    <Tile
      span={look.span}
      rows={look.rows}
      tone={look.tone}
      title={`Waiting for ${shown.name} · ${words}`}
      aside={
        steps.length > 1 && (
          <div role="group" aria-label="Step in the chart" className="flex flex-wrap gap-1">
            {steps.map((step) => (
              <button
                key={step.key}
                type="button"
                aria-pressed={step.key === shown.key}
                onClick={() => setPicked(step.key)}
                className={cn(look.chip, step.key === shown.key && look.chipOn)}
              >
                {step.name}
              </button>
            ))}
          </div>
        )
      }
    >
      <p className={cn("mt-3 leading-none font-semibold tracking-[-0.04em] tabular-nums", look.figure)}>{latest.load}</p>
      <p className={cn("mt-2 text-sm", look.muted)}>
        {latest.capacity > 0 ? `pieces waiting${on} · capacity ${asSet(latest.capacity)}` : `pieces waiting${on} · no capacity set`}
      </p>
      {over ? <p className={cn("mt-1 text-sm font-semibold", look.over)}>▲ Over your capacity</p> : null}
      <div className="mt-3 min-w-0 flex-1">
        <CapacityChart
          label={`Waiting for ${shown.name}, ${words}, against your capacity`}
          points={shown.points}
          capacityWords={asSet}
          dateLabel={dayLabel}
          height={look.height}
          tone={look.chart}
        />
      </div>
      <ul role="list" className={cn("mt-2 flex flex-wrap gap-x-4 text-caption", look.legend)}>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-0.5 w-3.5 rounded-full", look.load)} />
          Waiting
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-0.5 w-3.5 rounded-full", look.capacity)} />
          Your capacity
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-[#e0a33a]" />▲ Over your capacity
        </li>
      </ul>
    </Tile>
  );
}
