/**
 * A partner's answers from `/partner-portal/...`, in the shape the production views read
 * (`src/lib/production/shape.ts`). Field renames, plus what only a partner's job says: whose hands each
 * piece is in, and that a photo opens through its move.
 */

import type { PartnerJobDetail, PartnerMoveHistory, PartnerWorkOrder } from "@/lib/api/schema-types";
import type { Actor, MoveEntry, Photo, Piece, PieceStory, StepProgress, StepRules } from "@/lib/production/shape";

type DetailStep = PartnerJobDetail["steps"][number];
type JobPiece = PartnerJobDetail["work_orders"][number];

/** A partner reads names only for its own people; nobody's move counts for another partner here. */
function partnerActor(actor: { kind: "own" | "workspace" | "other_partner"; name: string | null }): Actor {
  return { kind: actor.kind, name: actor.name, forPartner: null };
}

/** A partner opens a photo through the move it came with. */
function partnerPhotos(photos: { file_id: string; file_version_id: string }[], moveId: string): Photo[] {
  return photos.map((photo) => ({ fileId: photo.file_id, fileVersionId: photo.file_version_id, moveId }));
}

/** The rules of the partner's own steps; every one is a partner step. */
export function partnerRules(job: PartnerJobDetail): StepRules[] {
  return job.steps.map((step: DetailStep) => ({
    key: step.key,
    name: step.name,
    checklist: step.checklist,
    defects: step.defects.map((defect) => ({ id: defect.id, key: defect.key, name: defect.name, outcome: defect.outcome, reworkTo: defect.rework_to })),
    reworkTargets: step.rework_targets,
    pass: { minPhotos: step.pass.min_photos, commentRequired: step.pass.comment_required },
    fail: { minPhotos: step.fail.min_photos, commentRequired: step.fail.comment_required },
    sampling: step.sampling ? { inspect: step.sampling.inspect, ofEvery: step.sampling.of_every } : null,
    sopFileVersionId: step.sop_file_version_id,
    partnerStep: true,
  }));
}

/** How the partner's steps are doing, counted since the job came to it. */
export function partnerProgress(job: PartnerJobDetail): StepProgress[] {
  return job.steps.map((step) => {
    const check = step.latest_check;
    return {
      key: step.key,
      name: step.name,
      count: step.count,
      inRework: step.in_rework,
      passed: step.passed,
      failed: step.failed,
      notInspected: step.not_inspected,
      defectCounts: step.defect_counts,
      latestCheck: check
        ? { moveId: check.move_id, actor: partnerActor(check.actor), createdAt: check.created_at, photos: partnerPhotos(check.photos, check.move_id) }
        : null,
    };
  });
}

/** A piece of the job. Only those at one of the partner's steps can be picked. */
export function partnerPiece(item: JobPiece): Piece {
  const last = item.last_move;
  return {
    id: item.id,
    label: item.label,
    status: item.status,
    stepKey: item.step_key,
    toInspect: item.to_inspect,
    inRework: item.in_rework,
    mayWork: item.stage === "yours",
    // erp-api lists no job of an order waiting for payment to partners, and offers them no assembly.
    held: null,
    lastMove: last
      ? { kind: last.kind, outcome: last.outcome, from_step: last.from_step, defect: last.defect, created_at: last.created_at, actor: partnerActor(last.actor) }
      : null,
  };
}

export function partnerEntry(action: PartnerMoveHistory["data"][number]): MoveEntry {
  const { actor, photos, ...rest } = action;
  return { ...rest, actor: partnerActor(actor), photos: partnerPhotos(photos, action.id) };
}

/** One piece and every move it has had. A partner has no instructions link here, and no replaced piece. */
export function partnerStory(piece: PartnerWorkOrder): PieceStory {
  return {
    id: piece.id,
    label: piece.label,
    status: piece.status,
    step: piece.step,
    inRework: piece.in_rework,
    path: piece.path,
    history: piece.history.map((move) => ({
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
      actor: partnerActor(move.actor),
      photos: partnerPhotos(move.photos, move.move_id),
    })),
    sop: null,
    replacesId: null,
  };
}
