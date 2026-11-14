"use client";

import type { ReactNode } from "react";

import type { PieceSection, SectionPieces } from "@/components/production/pieces-tab";
import { StepSelectionProvider } from "@/components/production/use-step-selection";
import { useStepPieces } from "@/lib/production/queries";
import type { Piece } from "@/lib/production/shape";
import { staffPiece } from "@/lib/production/staff";

/** A section of a line's pieces, loaded page by page from `/workflow/work-orders` once it's open. */
export function useStaffSectionPieces(groupId: string, section: PieceSection, open: boolean): SectionPieces {
  const status = section.status === "finished" || section.status === "scrapped" ? section.status : "active";
  const list = useStepPieces(groupId, section.stepKey, status, open);
  return {
    items: list.items.map(staffPiece),
    isPending: list.isPending,
    isError: list.isError,
    error: list.error,
    refetch: list.refetch,
    hasNextPage: list.hasNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
  };
}

function useStaffPiecesAt(groupId: string, stepKey: string | null): Piece[] | undefined {
  const list = useStepPieces(groupId, stepKey, "active", stepKey !== null);
  return list.data ? list.items.map(staffPiece) : undefined;
}

/** The pieces staff pick on an order page, kept honest against the picked step's list. */
export function StaffSelectionProvider({ children }: { children: ReactNode }) {
  return <StepSelectionProvider usePiecesAt={useStaffPiecesAt}>{children}</StepSelectionProvider>;
}
