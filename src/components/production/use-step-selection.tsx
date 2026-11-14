"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { pruneSelection } from "@/lib/production/selection";
import type { Piece } from "@/lib/production/shape";

interface Picked {
  groupId: string;
  stepKey: string;
  ids: Set<string>;
}

/**
 * The active pieces at one step of one line or job, or undefined until they've loaded. A hook, so each
 * area reads them its own way; it must stay the same function for the life of the provider.
 */
export type UsePiecesAt = (groupId: string, stepKey: string | null) => Piece[] | undefined;

const NOTHING = new Set<string>();

/**
 * The pieces picked on a page. A move names one step of one line, so picking
 * anywhere else starts again. Reading the picked step's list keeps the
 * selection honest: pieces that have moved on since leave it.
 */
function useSelectionState(usePiecesAt: UsePiecesAt) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const loaded = usePiecesAt(picked?.groupId ?? "", picked?.stepKey ?? null);
  const { ids, dropped } = picked && loaded ? pruneSelection(picked.ids, loaded, picked.stepKey) : { ids: picked?.ids ?? NOTHING, dropped: 0 };

  const pick = (groupId: string, stepKey: string, next: Set<string>) => setPicked(next.size > 0 ? { groupId, stepKey, ids: next } : null);

  return {
    groupId: picked?.groupId ?? null,
    stepKey: picked?.stepKey ?? null,
    ids,
    dropped,
    toggle(groupId: string, piece: Piece) {
      const { stepKey } = piece;
      if (!stepKey || !piece.mayWork) return;
      const same = picked?.groupId === groupId && picked.stepKey === stepKey;
      const next = new Set(same ? ids : NOTHING);
      if (!next.delete(piece.id)) next.add(piece.id);
      pick(groupId, stepKey, next);
    },
    selectAll(groupId: string, stepKey: string, pieces: Piece[]) {
      const workable = pieces.filter((piece) => piece.mayWork);
      if (workable.length > 0) pick(groupId, stepKey, new Set(workable.map((piece) => piece.id)));
    },
    clear() {
      setPicked(null);
    },
  };
}

type StepSelection = ReturnType<typeof useSelectionState>;

const StepSelectionContext = createContext<StepSelection | null>(null);

export function StepSelectionProvider({ usePiecesAt, children }: { usePiecesAt: UsePiecesAt; children: ReactNode }) {
  return <StepSelectionContext value={useSelectionState(usePiecesAt)}>{children}</StepSelectionContext>;
}

export function useStepSelection(): StepSelection {
  const selection = useContext(StepSelectionContext);
  if (!selection) throw new Error("useStepSelection needs a StepSelectionProvider");
  return selection;
}
