import { z } from "zod";

import type { MoveBody, WorkflowStep } from "@/lib/api/schema-types";

export type MoveKind = MoveBody["kind"];
type Defect = WorkflowStep["defects"][number];
type Outcome = Defect["outcome"];

/** What the move dialog collects; only what the kind of move uses is sent. */
export interface MoveValues {
  /** By checklist key; a yes/no answer reads "true" or "false". */
  answers: Record<string, string>;
  comment: string;
  photoVersionIds: string[];
  defectId: string;
  /** Whether someone opened "Change what happens". */
  changing: boolean;
  outcome: Outcome | "";
  reworkTo: string;
  overrideReason: string;
  toStep: string;
  inspected: boolean;
}

export function emptyMoveValues(step: WorkflowStep): MoveValues {
  return {
    answers: Object.fromEntries(step.checklist.map((item) => [item.key, ""])),
    comment: "",
    photoVersionIds: [],
    defectId: "",
    changing: false,
    outcome: "",
    reworkTo: "",
    overrideReason: "",
    toStep: "",
    inspected: true,
  };
}

const blank = (value: string | null | undefined) => !value?.trim();

/** What differs from the defect's default, or null when it's followed: erp-api refuses a reason then (`moves.service.ts:495`). */
function defectOverride(values: MoveValues, defect: Defect): { outcome?: Outcome; rework_to?: string } | null {
  if (!values.changing) return null;
  const outcome = values.outcome || defect.outcome;
  const outcomeChanged = outcome !== defect.outcome;
  const targetChanged = outcome === "rework" && values.reworkTo !== defect.rework_to;
  if (!outcomeChanged && !targetChanged) return null;
  return { ...(outcomeChanged ? { outcome } : {}), ...(outcome === "rework" ? { rework_to: values.reworkTo } : {}) };
}

/** The `POST /workflow/moves` body for what the dialog holds. */
export function moveBody(kind: MoveKind, step: WorkflowStep, ids: string[], values: MoveValues): MoveBody {
  const comment = values.comment.trim();
  const withComment = comment ? { comment } : {};
  const withPhotos = values.photoVersionIds.length > 0 ? { photo_file_version_ids: values.photoVersionIds } : {};

  if (kind === "correction") return { kind, work_order_ids: ids, to_step: values.toStep, comment };
  if (kind === "pass" && !values.inspected) return { kind, work_order_ids: ids, at_step: step.key, inspected: false, ...withComment };

  if (kind === "pass") {
    const answers = step.checklist.flatMap((item) => {
      const raw = values.answers[item.key]?.trim();
      return raw ? [{ item: item.key, value: item.kind === "yes_no" ? raw === "true" : raw }] : [];
    });
    return { kind, work_order_ids: ids, at_step: step.key, ...(answers.length > 0 ? { answers } : {}), ...withComment, ...withPhotos };
  }

  const defect = step.defects.find((d) => d.defect_id === values.defectId);
  const override = defect ? defectOverride(values, defect) : null;
  return {
    kind,
    work_order_ids: ids,
    at_step: step.key,
    defect_id: values.defectId,
    ...(override ? { ...override, override_reason: values.overrideReason.trim() } : {}),
    ...withComment,
    ...withPhotos,
  };
}

/** What the step asks for before anything is sent; `photoCount` is what has uploaded so far. */
export function moveSchema(kind: MoveKind, step: WorkflowStep, photoCount: number) {
  return z.custom<MoveValues>().superRefine((values, context) => {
    const refuse = (path: string[], message: string) => context.addIssue({ code: "custom", path, message });

    if (kind === "correction") {
      if (blank(values.toStep)) refuse(["toStep"], "Choose a step.");
      if (blank(values.comment)) refuse(["comment"], "Say why.");
      return;
    }

    if (kind === "pass") {
      for (const item of step.checklist) {
        if (item.required && blank(values.answers[item.key])) refuse(["answers", item.key], "Answer this.");
      }
    } else {
      const defect = step.defects.find((d) => d.defect_id === values.defectId);
      if (!defect) refuse(["defectId"], "Choose a defect.");
      else if (values.changing) {
        if (values.outcome === "rework" && blank(values.reworkTo)) refuse(["reworkTo"], "Choose where they go back to.");
        else if (defectOverride(values, defect) && blank(values.overrideReason)) refuse(["overrideReason"], "Say why this differs from the usual outcome.");
      }
    }

    const evidence = kind === "pass" ? step.pass : step.fail;
    if (photoCount < evidence.min_photos) refuse(["photoVersionIds"], `Add at least ${evidence.min_photos} ${evidence.min_photos === 1 ? "photo" : "photos"}.`);
    if (evidence.comment_required && blank(values.comment)) refuse(["comment"], "Add a comment.");
  });
}

const SERVER_FIELDS: Record<string, string> = {
  photos: "photoVersionIds",
  defect_id: "defectId",
  override_reason: "overrideReason",
  rework_to: "reworkTo",
  to_step: "toStep",
};

/** The form field for a path in erp-api's errors; the QC gate names a checklist answer by its key (`qc-gate.ts:94`). */
export function fieldPath(path: string, step: WorkflowStep): string {
  if (step.checklist.some((item) => item.key === path)) return `answers.${path}`;
  return SERVER_FIELDS[path] ?? path;
}
