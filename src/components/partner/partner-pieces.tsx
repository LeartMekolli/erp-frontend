"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";

import { PiecePanel } from "@/components/production/piece-panel";
import type { PieceSection, SectionPieces } from "@/components/production/pieces-tab";
import { StepSelectionProvider } from "@/components/production/use-step-selection";
import type { PartnerJobDetail } from "@/lib/api/schema-types";
import { partnerPiece, partnerStory } from "@/lib/partner-jobs/shape";
import { usePartnerJob, usePartnerPiece } from "@/lib/partner-jobs/queries";
import type { Piece } from "@/lib/production/shape";

import { useWorkshop } from "./use-workshop";

type JobPiece = PartnerJobDetail["work_orders"][number];

/** Whether a piece of the job belongs in a section of the Pieces tab. */
function inSection(piece: JobPiece, section: PieceSection): boolean {
  switch (section.status) {
    case "active":
      return piece.status === "active" && piece.step_key === section.stepKey;
    case "not_yet":
    case "done":
      return piece.stage === section.status;
    default:
      return piece.status === section.status;
  }
}

/**
 * The job's sections: the partner's steps holding pieces, then those not with it yet, those whose part is
 * done, and the finished and scrapped ones. Workspace steps never appear by name.
 */
export function partnerSections(job: PartnerJobDetail): PieceSection[] {
  const count = (section: Omit<PieceSection, "count">) => job.work_orders.filter((piece) => inSection(piece, { ...section, count: 0 })).length;
  const sections: Omit<PieceSection, "count">[] = [
    ...job.steps.map((step) => ({ id: step.key, name: step.name, inRework: step.in_rework, stepKey: step.key, status: "active" as const })),
    { id: "stage:not_yet", name: "Not with you yet", inRework: 0, stepKey: null, status: "not_yet" },
    { id: "stage:done", name: "Your part done", inRework: 0, stepKey: null, status: "done" },
    { id: "status:finished", name: "Finished", inRework: 0, stepKey: null, status: "finished" },
    { id: "status:scrapped", name: "Scrapped", inRework: 0, stepKey: null, status: "scrapped" },
  ];
  return sections.map((section) => ({ ...section, count: count(section) })).filter((section) => section.count > 0);
}

const NOTHING_MORE = () => undefined;

/** A section's pieces, from the job the page already holds: a partner's come all at once with the job. */
export function usePartnerSectionPieces(groupId: string, section: PieceSection, open: boolean): SectionPieces {
  const { partnerId } = useWorkshop();
  const job = usePartnerJob(partnerId, groupId);
  const pieces = job.data?.work_orders;
  return {
    items: open && pieces ? pieces.filter((piece) => inSection(piece, section)).map(partnerPiece) : [],
    isPending: job.isPending,
    isError: job.isError,
    error: job.error,
    refetch: job.refetch,
    hasNextPage: false,
    fetchNextPage: NOTHING_MORE,
    isFetchingNextPage: false,
  };
}

function usePartnerPiecesAt(groupId: string, stepKey: string | null): Piece[] | undefined {
  const { partnerId } = useWorkshop();
  const job = usePartnerJob(partnerId, groupId, stepKey !== null);
  const pieces = job.data?.work_orders;
  if (stepKey === null || !pieces) return undefined;
  return pieces.filter((piece) => piece.status === "active" && piece.step_key === stepKey).map(partnerPiece);
}

/** The pieces a partner picks on a job, kept honest against the job's latest pieces. */
export function PartnerSelectionProvider({ children }: { children: ReactNode }) {
  return <StepSelectionProvider usePiecesAt={usePartnerPiecesAt}>{children}</StepSelectionProvider>;
}

function usePartnerStory(id: string) {
  const { partnerId } = useWorkshop();
  const { groupId } = useParams<{ groupId: string }>();
  const piece = usePartnerPiece(partnerId, groupId, id);
  return { data: piece.data ? partnerStory(piece.data) : undefined, isPending: piece.isPending, error: piece.error, refetch: piece.refetch };
}

/** A piece's story on the job page. Its step's instructions are in the job's header, so the panel has none. */
export function PartnerPiecePanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  return <PiecePanel id={id} onClose={onClose} useStory={usePartnerStory} sopLink={null} />;
}
