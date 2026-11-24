import type { CapacityPoint } from "@/components/charts/capacity-chart";
import type { CapacityRow } from "@/lib/api/schema-types";

/** A capacity as the partner set it: "50 a day", "50 a week". AMI never turns one into the other. */
export function capacityWords(capacity: number, period: CapacityRow["capacity_period"]): string {
  return `${capacity} a ${period}`;
}

export interface WorkloadStep {
  key: string;
  name: string;
  points: CapacityPoint[];
  /** The step's newest row: its pieces waiting and its capacity now. */
  latest: CapacityRow;
}

/** How full a step is: pieces waiting over capacity; waiting with no capacity is fullest, nothing at all emptiest. */
function fullness(row: CapacityRow): number {
  if (row.capacity > 0) return row.load / row.capacity;
  return row.load > 0 ? Number.POSITIVE_INFINITY : -1;
}

/**
 * erp-api's rows (oldest day first, then step order) as one entry per step, each with its days as
 * points. The busiest step on its latest day comes first; steps as full as each other keep erp-api's order.
 */
export function workloadSteps(rows: CapacityRow[]): WorkloadStep[] {
  const steps = new Map<string, WorkloadStep>();
  for (const row of rows) {
    const { key, name } = row.step_type;
    let step = steps.get(key);
    if (!step) {
      step = { key, name, points: [], latest: row };
      steps.set(key, step);
    }
    step.points.push({ at: row.date, load: row.load, capacity: row.capacity });
    step.latest = row;
  }
  return [...steps.values()].toSorted((a, b) => {
    const first = fullness(a.latest);
    const second = fullness(b.latest);
    return first === second ? 0 : second > first ? 1 : -1;
  });
}
