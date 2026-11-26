/** Staff's answers from `/workflow/...`, in the shape the production views read. Field renames, nothing more. */

import type { Group, LineAction, WorkflowStep, WorkOrderDetail, WorkOrderListItem } from "@/lib/api/schema-types";

import type { Actor, MoveEntry, Photo, Piece, PieceStory, StepProgress, StepRules } from "./shape";

/** Every staff move is a staff member's, counting for the partner holding the line when there is one. */
function staffActor(actor: { name: string }, partner: { name: string } | null): Actor {
  return { kind: "staff", name: actor.name, forPartner: partner?.name ?? null };
}

/** Staff open a photo from its file, not its move. */
function staffPhotos(photos: { file_id: string; file_version_id: string }[]): Photo[] {
  return photos.map((photo) => ({ fileId: photo.file_id, fileVersionId: photo.file_version_id, moveId: null }));
}

/** A step's rules from the workflow version, its rework targets named from the line's path (by key when not on it). */
export function staffRules(step: WorkflowStep, path: { key: string; name: string }[]): StepRules {
  return {
    key: step.key,
    name: step.name,
    checklist: step.checklist,
    defects: step.defects.map((defect) => ({
      id: defect.defect_id,
      key: defect.key,
      name: defect.name,
      outcome: defect.outcome,
      reworkTo: defect.rework_to,
    })),
    reworkTargets: step.rework_targets.map((key) => ({ key, name: path.find((candidate) => candidate.key === key)?.name ?? key })),
    pass: { minPhotos: step.pass.min_photos, commentRequired: step.pass.comment_required },
    fail: { minPhotos: step.fail.min_photos, commentRequired: step.fail.comment_required },
    sampling: step.sampling ? { inspect: step.sampling.inspect, ofEvery: step.sampling.of_every } : null,
    sopFileVersionId: step.sop_file_version_id,
    partnerStep: step.done_by === "partner",
  };
}

/** A step of the line's path, with its counts and latest check. erp-api doesn't name the check's move to staff. */
export function staffProgress(step: Group["steps"][number]): StepProgress {
  const check = step.latest_check;
  return {
    key: step.key,
    name: step.name,
    count: step.count,
    inRework: step.in_rework,
    passed: step.passed,
    failed: step.failed,
    notInspected: step.not_inspected,
    defectCounts: step.defects,
    latestCheck: check
      ? { moveId: null, actor: staffActor(check.actor, check.partner), createdAt: check.created_at, photos: staffPhotos(check.photos) }
      : null,
  };
}

export function staffPiece(item: WorkOrderListItem): Piece {
  const last = item.last_move;
  return {
    id: item.id,
    label: item.label,
    status: item.status,
    stepKey: item.step?.key ?? null,
    toInspect: item.to_inspect,
    inRework: item.in_rework,
    mayWork: item.may_work,
    held: item.held,
    lastMove: last
      ? { kind: last.kind, outcome: last.outcome, from_step: last.from_step, defect: last.defect, created_at: last.created_at, actor: staffActor(last.actor, last.partner) }
      : null,
  };
}

export function staffEntry(action: LineAction): MoveEntry {
  const { actor, partner, photos, ...rest } = action;
  return { ...rest, actor: staffActor(actor, partner), photos: staffPhotos(photos) };
}

/**
 * One piece and its moves. erp-api doesn't say whether staff's piece is being redone, so it's read from
 * its last move, as the piece panel did: an active piece whose last move sent it back for rework.
 */
export function staffStory(detail: WorkOrderDetail): PieceStory {
  const last = detail.history.at(-1);
  return {
    id: detail.id,
    label: detail.label,
    status: detail.status,
    step: detail.step ? { key: detail.step.key, name: detail.step.name } : null,
    inRework: detail.status === "active" && last?.kind === "fail" && last.outcome === "rework",
    path: detail.path,
    history: detail.history.map((move) => ({
      id: move.id,
      kind: move.kind,
      outcome: move.outcome,
      from_step: move.from_step,
      to_step: move.to_step,
      defect: move.defect,
      override_reason: move.override_reason,
      comment: move.comment,
      answers: move.answers,
      inspected: move.inspected,
      created_at: move.created_at,
      actor: staffActor(move.actor, move.partner),
      photos: staffPhotos(move.photos),
    })),
    sop: detail.sop ? { fileId: detail.sop.file_id, fileVersionId: detail.sop.file_version_id } : null,
    replacesId: detail.replaces_id,
  };
}
