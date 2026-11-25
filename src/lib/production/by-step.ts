import type { StepCount } from "@/lib/api/schema-types";

import type { StepRules } from "./shape";

const DAY_MS = 86_400_000;

const activeIn = (steps: StepCount[]) => steps.reduce((sum, step) => sum + step.active, 0);

/** The workflow with the most active pieces, the earlier one on a tie; null when nothing is in progress. */
export function busiestWorkflow(counts: { workflowId: string; steps: StepCount[] }[]): string | null {
  let best: { workflowId: string; active: number } | null = null;
  for (const { workflowId, steps } of counts) {
    const active = activeIn(steps);
    if (active > 0 && (!best || active > best.active)) best = { workflowId, active };
  }
  return best?.workflowId ?? null;
}

/** The step with the most active pieces, the earlier one on a tie; null when none has any. */
export function busiestStep(steps: StepCount[]): string | null {
  let best: StepCount | null = null;
  for (const step of steps) if (step.active > 0 && (!best || step.active > best.active)) best = step;
  return best?.key ?? null;
}

const plural = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** How far a due day is from today, in words: "today", "in 2 days", "1 day late". Both are `YYYY-MM-DD` in the workspace's calendar. */
export function dueWords(dueOn: string | null, today: string): string | null {
  if (dueOn === null) return null;
  const days = Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  if (days === 0) return "today";
  return days > 0 ? `in ${plural(days)}` : `${plural(-days)} late`;
}

/** Where Move to… may send pieces from a step: back to one of its rework steps, or to scrap when it records any defect. */
export function moveTargets(rules: StepRules): { rework: { key: string; name: string }[]; scrap: boolean } {
  return { rework: rules.reworkTargets, scrap: rules.defects.length > 0 };
}
