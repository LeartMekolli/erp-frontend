/**
 * The one shape the production views read, whichever area they show in. Staff's answers come from
 * `/workflow/...` and a partner's from `/partner-portal/...`; each area translates its own into this
 * (staff in `staff.ts`, partners in `src/lib/partner-jobs/shape.ts`), so the views never know which.
 * A move entry and a piece's story keep erp-api's field names, as both areas send them the same.
 */

import type { LineAction, Transition, WorkflowStep, WorkOrderListItem } from "@/lib/api/schema-types";

/**
 * Who made a move. Staff see every person, and the partner a move counted for. A partner sees names only
 * for its own people: the workspace's moves and another workshop's are named by kind alone.
 */
export interface Actor {
  kind: "staff" | "own" | "workspace" | "other_partner";
  name: string | null;
  /** The partner a staff member's move counted for. */
  forPartner: string | null;
}

/** A QC photo. A partner's link goes through its move; staff's comes from the file, so theirs has none. */
export interface Photo {
  fileId: string;
  fileVersionId: string;
  moveId: string | null;
}

/** One checklist question, the same in both areas. */
export type ChecklistItem = WorkflowStep["checklist"][number];

/** What a pass or a fail at a step needs alongside it. */
export interface Evidence {
  minPhotos: number;
  commentRequired: boolean;
}

/** A step's QC rules: what it asks, the defects it records and where they send a piece. */
export interface StepRules {
  key: string;
  name: string;
  checklist: ChecklistItem[];
  defects: { id: string; key: string; name: string; outcome: WorkflowStep["defects"][number]["outcome"]; reworkTo: string | null }[];
  /** The steps a fail here may send a piece back to, with their names. */
  reworkTargets: { key: string; name: string }[];
  pass: Evidence;
  fail: Evidence;
  sampling: { inspect: number; ofEvery: number } | null;
  sopFileVersionId: string | null;
  /** Whether the partner holding the job does this step. */
  partnerStep: boolean;
}

/** How a step is doing: pieces waiting, checks made there, the defects found and the latest check. */
export interface StepProgress {
  key: string;
  name: string;
  count: number;
  inRework: number;
  passed: number;
  failed: number;
  notInspected: number;
  /** Most frequent first, as erp-api sends them. */
  defectCounts: { key: string; name: string; count: number }[];
  latestCheck: { moveId: string | null; actor: Actor; createdAt: string; photos: Photo[] } | null;
}

/**
 * Where a pass sends pieces: the next step, null at the last step (a pass finishes them), or "unknown"
 * for a partner, who sees only its own steps and can't tell what the workspace does next.
 */
export type NextStep = { name: string } | null | "unknown";

/** What last happened to a piece. */
export type LastMove = Omit<NonNullable<WorkOrderListItem["last_move"]>, "actor" | "partner"> & { actor: Actor };

/** One piece in a list. `mayWork` says whether the viewer may pass or fail it where it is. */
export interface Piece {
  id: string;
  label: string;
  status: WorkOrderListItem["status"];
  stepKey: string | null;
  toInspect: boolean | null;
  inRework: boolean;
  mayWork: boolean;
  lastMove: LastMove | null;
}

/** One action in History: every piece one move took, with what they share. */
export type MoveEntry = Omit<LineAction, "actor" | "partner" | "photos"> & { actor: Actor; photos: Photo[] };

/** One move in a piece's story. */
export type StoryMove = Pick<
  Transition,
  "id" | "kind" | "outcome" | "from_step" | "to_step" | "defect" | "override_reason" | "comment" | "answers" | "inspected" | "created_at"
> & { actor: Actor; photos: Photo[] };

/** One piece, its path and every move it has made, oldest first. */
export interface PieceStory {
  id: string;
  label: string;
  status: WorkOrderListItem["status"];
  step: { key: string; name: string } | null;
  inRework: boolean;
  path: { key: string; name: string }[];
  history: StoryMove[];
  /** The current step's instructions; staff only. */
  sop: { fileId: string; fileVersionId: string } | null;
  /** The piece this one replaces; staff only. */
  replacesId: string | null;
}
