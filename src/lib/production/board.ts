import type { StepCount, StepGroup } from "@/lib/api/schema-types";

import type { MoveTarget } from "./move-body";
import type { StepRules } from "./shape";

type StepRef = { key: string; name: string };

/** Where a card dragged from a step may land: the next step, a step it's sent back to, or Scrap. */
export interface DropTargets {
  /** The step after this one; null at the last step, where a pass finishes the pieces. */
  pass: StepRef | null;
  rework: StepRef[];
  scrap: boolean;
}

export type DropMove = { kind: "pass" } | { kind: "fail"; target: MoveTarget };

/**
 * The Board's columns: the current version's steps in path order, each with erp-api's count (0 when the counts
 * leave it out), and apart from them the steps only an older version still has pieces at.
 */
export function boardColumns(counts: StepCount[], current: StepRef[]): { columns: StepCount[]; older: StepCount[] } {
  const byKey = new Map(counts.map((step) => [step.key, step]));
  const keys = new Set(current.map((step) => step.key));
  return {
    columns: current.map((step) => byKey.get(step.key) ?? { key: step.key, name: step.name, active: 0, in_rework: 0, workable: 0, held: 0 }),
    older: counts.filter((step) => !keys.has(step.key) && step.active > 0),
  };
}

export function dropTargets(rules: StepRules, path: StepRef[]): DropTargets {
  const index = path.findIndex((step) => step.key === rules.key);
  const next = index >= 0 ? path[index + 1] : undefined;
  return { pass: next ? { key: next.key, name: next.name } : null, rework: rules.reworkTargets, scrap: rules.defects.length > 0 };
}

/** What a drop on `over` (a step's key, or "scrap") does to pieces at `from`; null where they can't go. */
export function dropMove(targets: DropTargets, over: string, from: string): DropMove | null {
  if (over === from) return null;
  if (over === "scrap") return targets.scrap ? { kind: "fail", target: { kind: "scrap" } } : null;
  if (targets.pass?.key === over) return { kind: "pass" };
  const back = targets.rework.find((step) => step.key === over);
  return back ? { kind: "fail", target: { kind: "rework", step: back } } : null;
}

/**
 * Whether a pass may skip the dialog and wait 5 seconds with Undo instead: the step asks for no answer, photo
 * or comment, no piece must be checked in full, and the move counts for no partner (passing a partner's last
 * step records what it's owed, so a stray drag mustn't do that).
 */
export function passesAtOnce(rules: StepRules, lines: StepGroup[], countsFor: string | null): boolean {
  return (
    !rules.checklist.some((item) => item.required) &&
    rules.pass.minPhotos === 0 &&
    !rules.pass.commentRequired &&
    lines.every((line) => line.to_inspect === 0) &&
    countsFor === null
  );
}
