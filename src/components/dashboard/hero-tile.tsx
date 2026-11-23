"use client";

import { useState } from "react";

import { cn } from "cn";

import { TrendChart } from "@/components/charts/trend-chart";
import type { DashboardRange } from "@/lib/api/schema-types";

import { ChangeLine } from "./change-line";
import { bucketLabel, heroMetrics, noOrdersWords, previousWords, type MetricKey } from "./headline";
import { Tile } from "./tile";

const CHIP = "min-h-8 rounded-full px-3 text-caption text-[#b9b6c9] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b7aaff] pointer-coarse:min-h-11";

/**
 * The dark hero: the reader's headline for the range (revenue, else on time, else orders), its change on the
 * previous range, and the trend under it. Chips switch it between the figures this reader may see.
 */
export function HeroTile({ range, words }: { range: DashboardRange; words: string }) {
  const metrics = heroMetrics(range);
  const [picked, setPicked] = useState<MetricKey | null>(null);
  const shown = metrics.find((one) => one.key === picked) ?? metrics[0]!;
  const empty = range.current.orders.placed === 0 ? noOrdersWords(range) : null;
  const previous = previousWords(range);
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

  return (
    <Tile
      span={8}
      rows={2}
      tone="dark"
      title={`${shown.label} · ${words}`}
      aside={
        metrics.length > 1 && (
          <div role="group" aria-label="Show in the chart" className="flex flex-wrap gap-1">
            {metrics.map((one) => (
              <button
                key={one.key}
                type="button"
                aria-pressed={one.key === shown.key}
                onClick={() => setPicked(one.key)}
                className={cn(CHIP, one.key === shown.key && "bg-white/12 font-medium text-white")}
              >
                {one.label}
              </button>
            ))}
          </div>
        )
      }
    >
      <p className="mt-3 text-[58px] leading-none font-semibold tracking-[-0.04em]">{shown.figure}</p>
      <ChangeLine change={shown.change} previous={previous} before={shown.before} tone="dark" />
      <div className="mt-3 min-w-0 flex-1">
        <TrendChart
          label={`${shown.label} by ${range.range.bucket}, ${words}, against the ${previous}`}
          tone="dark"
          height={220}
          // erp-api sends a range with no orders as zeros; the chart then draws bare axes with the message, not a flat line.
          points={range.series.map((point, index) =>
            empty ? { at: point.start, value: null, previous: null } : { at: point.start, value: shown.values[index] ?? null, previous: shown.previous[index] ?? null },
          )}
          format={shown.format}
          axis={shown.axis}
          dateLabel={(at) => bucketLabel(at, range.range.bucket)}
          empty={empty}
          endLabel
        />
      </div>
      <ul role="list" className="mt-2 flex flex-wrap gap-x-4 text-caption text-[#9e9bb0]">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-[#b7aaff]" />
          {capital(words)}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-[#5a5670]" />
          {capital(previous)}
        </li>
      </ul>
    </Tile>
  );
}
