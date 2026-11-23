"use client";

import { Columns } from "@/components/charts/columns";
import { Dumbbell } from "@/components/charts/dumbbell";
import { HBars } from "@/components/charts/hbars";
import { compactAxis } from "@/components/charts/scale-helpers";
import { TargetLine } from "@/components/charts/target-line";
import { CHART } from "@/components/charts/tokens";
import type { DashboardRange } from "@/lib/api/schema-types";
import { useDashboard } from "@/lib/dashboard/queries";

import { ChangeLine } from "./change-line";
import { bucketLabel, metric, percent, previousWords, rangeDays } from "./headline";
import { Tile } from "./tile";

const counts = (value: number) => String(value);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The production tiles, each only when erp-api sent its data: pieces at each step now, where time goes,
 * on time against the target, and defects by kind. Pass `chartWidth` to skip measuring (tests).
 */
export function ProductionTiles({ range, chartWidth }: { range: DashboardRange; chartWidth?: number }) {
  return (
    <>
      <PiecesNow width={chartWidth} />
      <WhereTimeGoes range={range} width={chartWidth} />
      <OnTime range={range} width={chartWidth} />
      <Defects range={range} />
    </>
  );
}

/**
 * Pieces at each step right now, in house and at a partner, stacked. Late is part of both, so it isn't
 * stacked on top (and a status colour is never a series): it's listed in words under the chart.
 */
function PiecesNow({ width }: { width?: number }) {
  const wip = useDashboard().data?.production?.wip;
  if (!wip) return null;
  const late = wip.filter((step) => step.late > 0);
  return (
    <Tile span={8} title="Pieces in production now" aside={<span className="text-caption text-ink-2">Now</span>}>
      <div className="mt-3">
        <Columns
          label="Pieces at each step now, in house and at a partner"
          data={wip.map((step) => ({ key: step.step_type_id, label: step.name, values: [step.in_house, step.at_partner] }))}
          series={[
            { name: "In house", color: CHART.violet },
            { name: "At a partner", color: CHART.lilac2 },
          ]}
          height={200}
          format={counts}
          axis={(value) => compactAxis(value)}
          empty="No pieces in production right now"
          width={width}
        />
      </div>
      {late.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-caption text-ink-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-late-ink">
            <span aria-hidden className="size-2 rounded-full bg-late" />
            Late
          </span>
          {late.map((step) => `${step.name} ${step.late}`).join(" · ")}
        </p>
      )}
    </Tile>
  );
}

/** The median hours at each step, the range before against this one; slower is red with ▲. */
function WhereTimeGoes({ range, width }: { range: DashboardRange; width?: number }) {
  const now = range.current.production.step_hours;
  const before = new Map(range.previous.production.step_hours.map((step) => [step.step_type_id, step.median_hours]));
  return (
    <Tile span={4} title="Where time goes" aside={<span className="text-caption text-ink-2">Median hours</span>}>
      {now.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">{`No steps finished in these ${rangeDays(range)} days`}</p>
      ) : (
        <div className="mt-3">
          <Dumbbell
            label={`Median hours at each step, the ${previousWords(range)} against now`}
            data={now.map((step) => ({ key: step.step_type_id, label: step.name, before: before.get(step.step_type_id) ?? null, now: step.median_hours }))}
            unit="h"
            width={width}
          />
        </div>
      )}
    </Tile>
  );
}

/** The on-time rate per bucket against the workspace's target, when one is set. */
function OnTime({ range, width }: { range: DashboardRange; width?: number }) {
  const target = range.on_time_target;
  return (
    <Tile span={5} title="On time against target">
      <div className="mt-3">
        <TargetLine
          label={`On time by ${range.range.bucket}${target !== null ? `, against a target of ${percent(target)}` : ""}`}
          points={range.series.map((point) => ({ at: point.start, rate: point.on_time_rate }))}
          target={target}
          dateLabel={(at) => bucketLabel(at, range.range.bucket)}
          height={180}
          empty={`Nothing was due in these ${rangeDays(range)} days`}
          width={width}
        />
      </div>
    </Tile>
  );
}

/** Defects by kind, most first, then the defect rate, claims and remakes. */
function Defects({ range }: { range: DashboardRange }) {
  const { production } = range.current;
  const rate = metric(range, "defects")!;
  return (
    <Tile span={3} title="Defects by kind">
      {production.defects_by_kind.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">No defects found.</p>
      ) : (
        <div className="mt-3">
          <HBars
            label="Defects by kind"
            data={production.defects_by_kind.map((kind) => ({ key: kind.defect_id, label: kind.name, value: kind.count, display: String(kind.count) }))}
          />
        </div>
      )}
      <div className="mt-auto border-t border-line pt-3">
        <p className="text-sm text-ink">
          {"Defect rate "}
          <span className="font-semibold">{rate.figure}</span>
        </p>
        <ChangeLine change={rate.change} previous={previousWords(range)} before={rate.before} tone="light" />
        <p className="mt-1 text-caption text-ink-2">{`${plural(production.claims, "claim", "claims")} · ${plural(production.remakes, "remake", "remakes")}`}</p>
      </div>
    </Tile>
  );
}
