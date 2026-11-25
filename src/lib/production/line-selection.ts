import type { StepGroup } from "@/lib/api/schema-types";

import type { Piece } from "./shape";

/**
 * What By step has ticked: pieces of one or more order lines, all at one step. Each line keeps the workflow
 * version its pieces started on, because a move's rules come from one version. Never empty: no ticks is null.
 */
export interface LineSelection {
  stepKey: string;
  lines: Map<string, { version: number; ids: Set<string> }>;
}

/** The selection without the lines that ended up empty; null when none is left. */
function settled(stepKey: string, lines: Map<string, { version: number; ids: Set<string> }>): LineSelection | null {
  const kept = new Map([...lines].filter(([, line]) => line.ids.size > 0));
  return kept.size > 0 ? { stepKey, lines: kept } : null;
}

/** The lines picked so far at `stepKey`; picking at another step starts again. */
const linesAt = (selection: LineSelection | null, stepKey: string) =>
  new Map(selection?.stepKey === stepKey ? selection.lines : []);

/** A line's tick box: ticked when every piece erp-api says the person may work is picked, mixed when only some are. */
export function lineState(selection: LineSelection | null, line: StepGroup): boolean | "indeterminate" {
  const picked = selection?.lines.get(line.group.id)?.ids.size ?? 0;
  if (picked === 0) return false;
  return picked >= line.workable ? true : "indeterminate";
}

/** Ticks every workable piece of a line, or unticks the line when it was ticked in full. */
export function toggleLine(selection: LineSelection | null, stepKey: string, line: StepGroup, workableIds: string[]): LineSelection | null {
  const lines = linesAt(selection, stepKey);
  if (lineState(selection?.stepKey === stepKey ? selection : null, line) === true) lines.delete(line.group.id);
  else lines.set(line.group.id, { version: line.group.workflow.version, ids: new Set(workableIds) });
  return settled(stepKey, lines);
}

/** Ticks or unticks one piece; a piece the person may not work is left as it is. */
export function togglePiece(selection: LineSelection | null, stepKey: string, line: StepGroup, piece: Piece): LineSelection | null {
  if (!piece.mayWork) return selection;
  const lines = linesAt(selection, stepKey);
  const ids = new Set(lines.get(line.group.id)?.ids);
  if (ids.has(piece.id)) ids.delete(piece.id);
  else ids.add(piece.id);
  lines.set(line.group.id, { version: line.group.workflow.version, ids });
  return settled(stepKey, lines);
}

/** Every picked piece, line by line. */
export function pieceIds(selection: LineSelection): string[] {
  return [...selection.lines.values()].flatMap((line) => [...line.ids]);
}

/** The workflow versions the picked lines are on, lowest first. More than one can't move together. */
export function versions(selection: LineSelection): number[] {
  return [...new Set([...selection.lines.values()].map((line) => line.version))].sort((a, b) => a - b);
}

/** Only the lines on `version`. */
export function keepVersion(selection: LineSelection, version: number): LineSelection | null {
  return settled(selection.stepKey, new Map([...selection.lines].filter(([, line]) => line.version === version)));
}

/**
 * The selection kept to the pieces still at the step after a refetch (`stillHere`: each line's workable pieces
 * there, by group id), and how many picked pieces left it.
 */
export function pruneLines(selection: LineSelection | null, stillHere: Map<string, Set<string>>): { selection: LineSelection | null; dropped: number } {
  if (!selection) return { selection: null, dropped: 0 };
  let dropped = 0;
  const lines = new Map(
    [...selection.lines].map(([groupId, line]) => {
      const here = stillHere.get(groupId);
      const ids = new Set([...line.ids].filter((id) => here?.has(id)));
      dropped += line.ids.size - ids.size;
      return [groupId, { ...line, ids }] as const;
    }),
  );
  return { selection: settled(selection.stepKey, lines), dropped };
}
