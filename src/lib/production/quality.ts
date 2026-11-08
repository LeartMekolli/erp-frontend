import type { Group, WorkflowStep } from "@/lib/api/schema-types";

export interface QualityCard {
  key: string;
  name: string;
  waiting: number;
  inRework: number;
  sampling: WorkflowStep["sampling"];
}

/** One card per step of the path with a checklist or defects, and the names of the steps with neither. */
export function qualityCards(steps: Group["steps"], config: WorkflowStep[]): { cards: QualityCard[]; noChecks: string[] } {
  const cards: QualityCard[] = [];
  const noChecks: string[] = [];
  for (const step of steps) {
    const setup = config.find((candidate) => candidate.key === step.key);
    if (setup && (setup.checklist.length > 0 || setup.defects.length > 0)) {
      cards.push({ key: step.key, name: step.name, waiting: step.count, inRework: step.in_rework, sampling: setup.sampling });
    } else {
      noChecks.push(step.name);
    }
  }
  return { cards, noChecks };
}
