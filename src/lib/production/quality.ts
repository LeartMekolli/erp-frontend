import type { Group, WorkflowStep } from "@/lib/api/schema-types";

type Step = Group["steps"][number];

/**
 * What a step's card leads with: failures first, then pieces waiting, then whether any came at all. A step
 * is only all through once no piece is left before it; until then it says how many passed so far.
 */
export type QualityState =
  | { kind: "failed"; count: number }
  | { kind: "waiting"; count: number }
  | { kind: "so_far"; passed: number }
  | { kind: "through" }
  | { kind: "not_reached" };

export interface QualityCard {
  key: string;
  name: string;
  waiting: number;
  inRework: number;
  /** Moves, not pieces: a piece that fails and then passes counts once in each. */
  passed: number;
  failed: number;
  /** The part of `passed` left out of the step's sample. */
  notInspected: number;
  /** Most frequent first, as erp-api sends them. */
  defects: Step["defects"];
  latestCheck: Step["latest_check"];
  sampling: WorkflowStep["sampling"];
  state: QualityState;
}

/** `before` is how many active pieces are at the steps ahead of this one in the path. */
function stateOf(step: Step, before: number): QualityState {
  if (step.failed > 0) return { kind: "failed", count: step.failed };
  if (step.count > 0) return { kind: "waiting", count: step.count };
  if (step.passed === 0) return { kind: "not_reached" };
  return before > 0 ? { kind: "so_far", passed: step.passed } : { kind: "through" };
}

/** One card per step of the path with a checklist or defects, and the names of the steps with neither. */
export function qualityCards(steps: Group["steps"], config: WorkflowStep[]): { cards: QualityCard[]; noChecks: string[] } {
  const cards: QualityCard[] = [];
  const noChecks: string[] = [];
  let before = 0;
  for (const step of steps) {
    const setup = config.find((candidate) => candidate.key === step.key);
    if (setup && (setup.checklist.length > 0 || setup.defects.length > 0)) {
      cards.push({
        key: step.key,
        name: step.name,
        waiting: step.count,
        inRework: step.in_rework,
        passed: step.passed,
        failed: step.failed,
        notInspected: step.not_inspected,
        defects: step.defects,
        latestCheck: step.latest_check,
        sampling: setup.sampling,
        state: stateOf(step, before),
      });
    } else {
      noChecks.push(step.name);
    }
    before += step.count;
  }
  return { cards, noChecks };
}

/** How many checks failed across a line's steps, for its Quality tab. */
export function failedOnLine(steps: Group["steps"]): number {
  return steps.reduce((sum, step) => sum + step.failed, 0);
}
