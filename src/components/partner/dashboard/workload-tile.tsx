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

const CHIP = "min-h-8 rounded-full px-3 text-caption text-[#b9b6c9] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b7aaff] pointer-coarse:min-h-11";
const NOTHING_KEPT = "No workload recorded yet. AMI records it each night for the steps you can do.";
const dayLabel = (iso: string) => bucketLabel(iso, "day");
/** The calendar day before `day` (`YYYY-MM-DD`). */
const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * The dark hero: pieces waiting at the busiest step against the capacity the partner set, as erp-api
 * keeps it each night. Chips switch the step. It's the same for every role: nothing here is money.
 */
export function WorkloadTile({ partnerId, range, words, today }: { partnerId: string; range: DayRange; words: string; today: string }) {
  const capacity = usePartnerCapacity(partnerId, range);
  const [picked, setPicked] = useState<string | null>(null);
  const steps = capacity.data ? workloadSteps(capacity.data) : [];
  const shown = steps.find((step) => step.key === picked) ?? steps[0];

  if (!capacity.data) {
    return (
      <Tile span={8} rows={2} tone="dark" title={`Workload · ${words}`}>
        {capacity.isError ? (
          <div className="mt-3 rounded-[12px] bg-white px-3">
            <LoadFailure error={capacity.error} fallback="Couldn't load the workload." onRetry={() => void capacity.refetch()} />
          </div>
        ) : (
          <p role="status" className="mt-3 text-sm text-[#b9b6c9]">
            Loading the workload…
          </p>
        )}
      </Tile>
    );
  }

  if (!shown) {
    return (
      <Tile span={8} rows={2} tone="dark" title={`Workload · ${words}`}>
        <div className="mt-3 min-w-0 flex-1">
          <CapacityChart label={`Workload, ${words}`} points={[]} capacityWords={String} dateLabel={dayLabel} height={220} tone="dark" empty={NOTHING_KEPT} />
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
      span={8}
      rows={2}
      tone="dark"
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
                className={cn(CHIP, step.key === shown.key && "bg-white/12 font-medium text-white")}
              >
                {step.name}
              </button>
            ))}
          </div>
        )
      }
    >
      <p className="mt-3 text-[clamp(40px,13vw,58px)] leading-none font-semibold tracking-[-0.04em] tabular-nums">{latest.load}</p>
      <p className="mt-2 text-sm text-[#b9b6c9]">
        {latest.capacity > 0 ? `pieces waiting${on} · capacity ${asSet(latest.capacity)}` : `pieces waiting${on} · no capacity set`}
      </p>
      {over ? <p className="mt-1 text-sm font-semibold text-[#ffd27a]">▲ Over your capacity</p> : null}
      <div className="mt-3 min-w-0 flex-1">
        <CapacityChart
          label={`Waiting for ${shown.name}, ${words}, against your capacity`}
          points={shown.points}
          capacityWords={asSet}
          dateLabel={dayLabel}
          height={220}
          tone="dark"
        />
      </div>
      <ul role="list" className="mt-2 flex flex-wrap gap-x-4 text-caption text-[#9e9bb0]">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-[#b7aaff]" />
          Waiting
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-[#9e9bb0]" />
          Your capacity
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-[#e0a33a]" />▲ Over your capacity
        </li>
      </ul>
    </Tile>
  );
}
