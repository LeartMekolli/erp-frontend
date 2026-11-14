"use client";

import { useState, type ReactNode } from "react";

import { HistoryTab } from "@/components/production/history-tab";
import { PhotoLinksProvider } from "@/components/production/photo-links";
import { PiecePanel } from "@/components/production/piece-panel";
import { QualityTab } from "@/components/production/quality-tab";
import type { Group } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { downloadUrl } from "@/lib/files/download";
import { useLineMoves, usePiece, useWorkflowVersion, type MovesFilter } from "@/lib/production/queries";
import type { PieceStory } from "@/lib/production/shape";
import { staffEntry, staffProgress, staffRules, staffStory } from "@/lib/production/staff";

/** Staff open a photo from its file, and see photos only with `file.read`. */
export function StaffPhotoLinks({ children }: { children: ReactNode }) {
  const mayView = useCan("file.read");
  return (
    <PhotoLinksProvider link={(photo) => downloadUrl(photo.fileId, photo.fileVersionId)} mayView={mayView}>
      {children}
    </PhotoLinksProvider>
  );
}

/** The line's steps' rules from its workflow version, with the version's load state. */
function useLineRules(group: Group) {
  const version = useWorkflowVersion(group.workflow.id, group.workflow.version);
  return {
    data: version.data?.steps.map((step) => staffRules(step, group.steps)),
    isPending: version.isPending,
    error: version.error,
    refetch: version.refetch,
  };
}

/** A line's Quality tab, from its counts and its workflow version. */
export function StaffQualityTab({ group }: { group: Group }) {
  const rules = useLineRules(group);
  return (
    <StaffPhotoLinks>
      <QualityTab progress={group.steps.map(staffProgress)} rules={rules.data} rulesState={rules} of="line" />
    </StaffPhotoLinks>
  );
}

/** A line's History, from `/workflow/groups/:id/moves`. */
export function StaffHistoryTab({ group }: { group: Group }) {
  const [filter, setFilter] = useState<MovesFilter>("all");
  const moves = useLineMoves(group.id, filter);
  const rules = useLineRules(group);
  return (
    <StaffPhotoLinks>
      <HistoryTab
        list={{ ...moves, items: moves.items.map(staffEntry) }}
        counts={moves.counts}
        filter={filter}
        onFilter={setFilter}
        rules={rules}
        cameAt={null}
        of="line"
      />
    </StaffPhotoLinks>
  );
}

function useStaffStory(id: string) {
  const piece = usePiece(id);
  return { data: piece.data ? staffStory(piece.data) : undefined, isPending: piece.isPending, error: piece.error, refetch: piece.refetch };
}

const sopLink = (story: PieceStory) => (story.sop ? downloadUrl(story.sop.fileId, story.sop.fileVersionId) : Promise.reject(new Error("No instructions")));

/** A piece's story on the order page; its step's instructions open with `file.read`. */
export function StaffPiecePanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const mayRead = useCan("file.read");
  return (
    <StaffPhotoLinks>
      <PiecePanel id={id} onClose={onClose} useStory={useStaffStory} sopLink={mayRead ? sopLink : null} />
    </StaffPhotoLinks>
  );
}
