import { describe, expect, it } from "vitest";

import type { Group, WorkflowStep } from "@/lib/api/schema-types";

import type { Answer } from "../../../test/fake-erp-api/orders";
import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { createProductionStore } from "../../../test/fake-erp-api/production";
import { NORTHCAST_ID } from "../../../test/fake-erp-api/seed";

import { staffEntry, staffPiece, staffProgress, staffRules, staffStory } from "./staff";

const NOW = Date.parse("2026-11-04T10:00:00Z");
const GROUP = groupIdOf(1048, 0);
const ANA = { kind: "staff", name: "Ana Ruiz", forPartner: null };

function ok<T>(answer: Answer<T>): T {
  if (!answer.ok) throw new Error(`expected a body, got ${answer.status}`);
  return answer.body;
}

function store() {
  return createProductionStore(() => NOW);
}

type Store = ReturnType<typeof store>;

const groupOf = (s: Store): Group => ok(s.group(GROUP));
const stepsOf = (s: Store): WorkflowStep[] => {
  const { workflow } = groupOf(s);
  return ok(s.version(workflow.id, workflow.version)).steps;
};
const stepAt = (s: Store, key: string) => stepsOf(s).find((step) => step.key === key)!;
const piecesAt = (s: Store, stepKey: string) => ok(s.pieces(new URLSearchParams({ group_id: GROUP, step_key: stepKey, status: "active" }))).data;
const reworked = (s: Store) => piecesAt(s, "finish").find((piece) => piece.in_rework)!;

describe("staffRules", () => {
  it("names rework targets from the path", () => {
    const s = store();
    const finish = stepAt(s, "finish");
    const rules = staffRules(finish, groupOf(s).steps);
    expect(rules.reworkTargets).toEqual([{ key: "finish", name: "Finish" }]);
    expect(rules.defects[0]).toEqual({ id: finish.defects[0]!.defect_id, key: "scratch", name: "Scratch", outcome: "rework", reworkTo: "finish" });
  });

  it("names a rework target by its key when the path doesn't have it", () => {
    expect(staffRules(stepAt(store(), "finish"), []).reworkTargets).toEqual([{ key: "finish", name: "finish" }]);
  });

  it("marks a partner step", () => {
    const s = store();
    const path = groupOf(s).steps;
    expect(staffRules(stepAt(s, "finish"), path).partnerStep).toBe(true);
    expect(staffRules(stepAt(s, "final_qc"), path).partnerStep).toBe(false);
  });

  it("carries a step's evidence, instructions and sampling", () => {
    const s = store();
    const finish = stepAt(s, "finish");
    const rules = staffRules({ ...finish, sampling: { inspect: 1, of_every: 3 } }, groupOf(s).steps);
    expect(rules).toMatchObject({
      key: "finish",
      name: "Finish",
      checklist: finish.checklist,
      pass: { minPhotos: 1, commentRequired: false },
      fail: { minPhotos: 0, commentRequired: false },
      sampling: { inspect: 1, ofEvery: 3 },
      sopFileVersionId: finish.sop_file_version_id,
    });
    expect(staffRules(stepAt(s, "final_qc"), groupOf(s).steps)).toMatchObject({ fail: { minPhotos: 0, commentRequired: true }, sampling: null, sopFileVersionId: null });
  });
});

describe("staffProgress", () => {
  it("carries a step's counts and its latest check, by staff", () => {
    const step = groupOf(store()).steps.find((candidate) => candidate.key === "final_qc")!;
    const check = step.latest_check!;
    expect(check.photos).toHaveLength(1);
    expect(staffProgress(step)).toEqual({
      key: "final_qc",
      name: "Final QC",
      count: step.count,
      inRework: step.in_rework,
      passed: step.passed,
      failed: step.failed,
      notInspected: step.not_inspected,
      defectCounts: step.defects,
      latestCheck: {
        moveId: null,
        actor: ANA,
        createdAt: check.created_at,
        photos: check.photos.map((photo) => ({ fileId: photo.file_id, fileVersionId: photo.file_version_id, moveId: null })),
      },
    });
  });

  it("has no latest check where nothing was checked", () => {
    const packing = groupOf(store()).steps.find((candidate) => candidate.key === "packing")!;
    expect(staffProgress({ ...packing, latest_check: null }).latestCheck).toBeNull();
  });
});

describe("staffEntry", () => {
  it("reads staff as the actor, for the partner", () => {
    const [action] = ok(store().moves(GROUP, new URLSearchParams())).data;
    const entry = staffEntry({ ...action!, partner: { id: NORTHCAST_ID, name: "Northcast Foundry" } });
    expect(entry.actor).toEqual({ kind: "staff", name: action!.actor.name, forPartner: "Northcast Foundry" });
    expect(entry).not.toHaveProperty("partner");
  });

  it("keeps the action's own fields and opens its photos from their files", () => {
    const fail = ok(store().moves(GROUP, new URLSearchParams({ only: "fails" }))).data.find((action) => action.photos.length > 0)!;
    const entry = staffEntry(fail);
    expect(entry).toMatchObject({ id: fail.id, kind: "fail", from_step: fail.from_step, pieces: fail.pieces, actor: ANA });
    expect(entry.photos).toEqual(fail.photos.map((photo) => ({ fileId: photo.file_id, fileVersionId: photo.file_version_id, moveId: null })));
  });
});

describe("staffPiece", () => {
  it("keeps a piece's skill check", () => {
    const s = store();
    expect(piecesAt(s, "finish").map(staffPiece).every((piece) => piece.mayWork)).toBe(true);
    s.requireSkill("finish");
    expect(piecesAt(s, "finish").map(staffPiece).some((piece) => piece.mayWork)).toBe(false);
    expect(piecesAt(s, "print").map(staffPiece).every((piece) => piece.mayWork)).toBe(true);
  });

  it("carries where a piece is and what last happened to it", () => {
    const item = reworked(store());
    const piece = staffPiece(item);
    expect(piece).toMatchObject({ id: item.id, label: item.label, status: "active", stepKey: "finish", toInspect: null, inRework: true });
    expect(piece.lastMove).toEqual({
      kind: "fail",
      outcome: "rework",
      from_step: item.last_move!.from_step,
      defect: item.last_move!.defect,
      created_at: item.last_move!.created_at,
      actor: ANA,
    });
  });
});

describe("staffStory", () => {
  it("reads a piece being redone from its last move", () => {
    const s = store();
    const detail = ok(s.piece(reworked(s).id));
    const story = staffStory(detail);
    expect(story).toMatchObject({ label: detail.label, status: "active", step: { key: "finish", name: "Finish" }, inRework: true, replacesId: null });
    expect(story.step).not.toHaveProperty("id");
    expect(story.sop).toEqual({ fileId: detail.sop!.file_id, fileVersionId: detail.sop!.file_version_id });
    expect(story.path).toEqual(detail.path);
  });

  it("isn't being redone after a pass", () => {
    const s = store();
    const story = staffStory(ok(s.piece(piecesAt(s, "final_qc")[0]!.id)));
    expect(story).toMatchObject({ inRework: false, sop: null });
  });

  it("carries each move with staff as its actor", () => {
    const s = store();
    const detail = ok(s.piece(reworked(s).id));
    const last = staffStory(detail).history.at(-1)!;
    const raw = detail.history.at(-1)!;
    expect(last).toEqual({
      id: raw.id,
      kind: "fail",
      outcome: "rework",
      from_step: raw.from_step,
      to_step: raw.to_step,
      defect: raw.defect,
      override_reason: null,
      comment: "Pitted along one edge",
      answers: raw.answers,
      inspected: true,
      created_at: raw.created_at,
      actor: ANA,
      photos: raw.photos.map((photo) => ({ fileId: photo.file_id, fileVersionId: photo.file_version_id, moveId: null })),
    });
  });
});
