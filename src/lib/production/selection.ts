import type { Group, WorkOrderListItem } from "@/lib/api/schema-types";

/** The step after this one on the path; null at the last. */
export function nextStepName(steps: Group["steps"], key: string): string | null {
  const index = steps.findIndex((step) => step.key === key);
  return index === -1 ? null : (steps[index + 1]?.name ?? null);
}

/** The selected pieces that can still be moved from this step, and how many no longer can. */
export function pruneSelection(ids: Set<string>, pieces: WorkOrderListItem[], stepKey: string): { ids: Set<string>; dropped: number } {
  const still = new Set(
    pieces.filter((piece) => ids.has(piece.id) && piece.status === "active" && piece.step?.key === stepKey && piece.may_work).map((piece) => piece.id),
  );
  return { ids: still, dropped: ids.size - still.size };
}
