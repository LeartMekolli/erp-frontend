"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { WorkOrderListItem } from "@/lib/api/schema-types";
import { useStepPieces } from "@/lib/production/queries";
import { pruneSelection } from "@/lib/production/selection";

interface Picked {
  groupId: string;
  stepKey: string;
  ids: Set<string>;
}

const NOTHING = new Set<string>();

/**
 * The pieces picked on an order page. A move names one step of one line, so
 * picking anywhere else starts again. Reading the picked step's list keeps the
 * selection honest: pieces that have moved on since leave it.
 */
function useSelectionState() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const loaded = useStepPieces(picked?.groupId ?? "", picked?.stepKey ?? null, "active", picked !== null);
  const { ids, dropped } =
    picked && loaded.data ? pruneSelection(picked.ids, loaded.items, picked.stepKey) : { ids: picked?.ids ?? NOTHING, dropped: 0 };

  const pick = (groupId: string, stepKey: string, next: Set<string>) => setPicked(next.size > 0 ? { groupId, stepKey, ids: next } : null);

  return {
    groupId: picked?.groupId ?? null,
    stepKey: picked?.stepKey ?? null,
    ids,
    dropped,
    toggle(piece: WorkOrderListItem) {
      const stepKey = piece.step?.key;
      if (!stepKey || !piece.may_work) return;
      const same = picked?.groupId === piece.group_id && picked.stepKey === stepKey;
      const next = new Set(same ? ids : NOTHING);
      if (!next.delete(piece.id)) next.add(piece.id);
      pick(piece.group_id, stepKey, next);
    },
    selectAll(stepKey: string, pieces: WorkOrderListItem[]) {
      const workable = pieces.filter((piece) => piece.may_work);
      if (workable[0]) pick(workable[0].group_id, stepKey, new Set(workable.map((piece) => piece.id)));
    },
    clear() {
      setPicked(null);
    },
  };
}

type StepSelection = ReturnType<typeof useSelectionState>;

const StepSelectionContext = createContext<StepSelection | null>(null);

export function StepSelectionProvider({ children }: { children: ReactNode }) {
  return <StepSelectionContext value={useSelectionState()}>{children}</StepSelectionContext>;
}

export function useStepSelection(): StepSelection {
  const selection = useContext(StepSelectionContext);
  if (!selection) throw new Error("useStepSelection needs a StepSelectionProvider");
  return selection;
}
