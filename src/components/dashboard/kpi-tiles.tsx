import { Sparkline } from "@/components/charts/sparkline";
import type { DashboardRange } from "@/lib/api/schema-types";

import { ChangeLine } from "./change-line";
import { kpiMetrics, previousWords } from "./headline";
import { Tile } from "./tile";

/** How many of the latest points a KPI's sparkline shows. */
const SPARK_POINTS = 12;

/** Orders placed, Average order, On time and Defect rate: each a figure, its change and a sparkline. */
export function KpiTiles({ range }: { range: DashboardRange }) {
  const previous = previousWords(range);
  return kpiMetrics(range).map((one) => (
    <Tile key={one.key} span={3} title={one.label}>
      <p className="mt-1 text-[34px] leading-tight font-semibold tracking-[-0.04em]">{one.figure}</p>
      <ChangeLine change={one.change} previous={previous} before={one.before} tone="light" />
      <div className="mt-auto pt-3">
        <Sparkline values={one.values.slice(-SPARK_POINTS)} label={`${one.label}, the latest ${Math.min(SPARK_POINTS, one.values.length)} points`} />
      </div>
    </Tile>
  ));
}
