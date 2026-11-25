import { describe, expect, it } from "vitest";

import { createProductionStore } from "../../../test/fake-erp-api/production";
import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";

import { emptyMoveValues, fieldPath, moveBody, moveSchema, type MoveTarget, type MoveValues } from "./move-body";
import type { StepRules } from "./shape";
import { staffRules } from "./staff";

function steps(): StepRules[] {
  const store = createProductionStore(() => 0);
  const group = store.group(groupIdOf(1048, 0));
  if (!group.ok) throw new Error("expected a group");
  const version = store.version(group.body.workflow.id, group.body.workflow.version);
  if (!version.ok) throw new Error("expected a version");
  return version.body.steps.map((step) => staffRules(step, group.body.steps));
}

const stepAt = (key: string) => steps().find((step) => step.key === key)!;
const finish = () => stepAt("finish");
const finalQc = () => stepAt("final_qc");

const values = (step: StepRules, changes: Partial<MoveValues> = {}): MoveValues => ({ ...emptyMoveValues(step), ...changes });

function problems(schema: ReturnType<typeof moveSchema>, input: MoveValues) {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("moveBody", () => {
  it("sends a pass's yes/no answers as booleans, with its photos", () => {
    const step = finish();
    expect(moveBody("pass", step, ["a"], values(step, { answers: { surface_smooth: "true" }, photoVersionIds: ["p"] }))).toEqual({
      kind: "pass",
      work_order_ids: ["a"],
      at_step: "finish",
      answers: [{ item: "surface_smooth", value: true }],
      photo_file_version_ids: ["p"],
    });
  });

  it("leaves out what wasn't filled in", () => {
    const step = stepAt("print");
    expect(moveBody("pass", step, ["a"], values(step))).toEqual({ kind: "pass", work_order_ids: ["a"], at_step: "print" });
  });

  it("sends a pass without inspecting with no answers or photos", () => {
    const step = finish();
    expect(moveBody("pass", step, ["a"], values(step, { inspected: false, answers: { surface_smooth: "true" }, photoVersionIds: ["p"] }))).toEqual({
      kind: "pass",
      work_order_ids: ["a"],
      at_step: "finish",
      inspected: false,
    });
  });

  it("follows a defect's default with nothing extra", () => {
    const step = finalQc();
    const defectId = step.defects[0]!.id;
    expect(moveBody("fail", step, ["a"], values(step, { defectId, comment: " Pitted " }))).toEqual({
      kind: "fail",
      work_order_ids: ["a"],
      at_step: "final_qc",
      defect_id: defectId,
      comment: "Pitted",
    });
  });

  it("sends a changed outcome with its reason, and no rework target", () => {
    const step = finalQc();
    const defectId = step.defects[0]!.id;
    const body = moveBody("fail", step, ["a"], values(step, { defectId, changing: true, outcome: "scrap", overrideReason: "Too deep" }));
    expect(body).toMatchObject({ outcome: "scrap", override_reason: "Too deep" });
    expect(body).not.toHaveProperty("rework_to");
  });

  it("sends no reason when the change ends up the same as the default", () => {
    const step = finalQc();
    const defect = step.defects[0]!;
    const body = moveBody("fail", step, ["a"], values(step, { defectId: defect.id, changing: true, outcome: "rework", reworkTo: defect.reworkTo!, overrideReason: "Same" }));
    expect(body).not.toHaveProperty("override_reason");
    expect(body).not.toHaveProperty("outcome");
  });

  it("sends a correction with its step and comment only", () => {
    const step = finish();
    expect(moveBody("correction", step, ["a"], values(step, { toStep: "print", comment: "Moved by mistake" }))).toEqual({
      kind: "correction",
      work_order_ids: ["a"],
      to_step: "print",
      comment: "Moved by mistake",
    });
  });
});

describe("moveSchema", () => {
  it("wants required answers, photos and a comment where the step asks", () => {
    const step = finish();
    expect(problems(moveSchema("pass", step, 0), values(step))).toEqual(["answers.surface_smooth", "photoVersionIds"]);
    expect(problems(moveSchema("pass", step, 1), values(step, { answers: { surface_smooth: "true" } }))).toEqual([]);
    const qc = finalQc();
    expect(problems(moveSchema("fail", qc, 0), values(qc))).toEqual(["defectId", "comment"]);
  });

  it("wants a reason only when the outcome really changes", () => {
    const step = finalQc();
    const defect = step.defects[0]!;
    const base = { defectId: defect.id, comment: "Pitted", changing: true };
    expect(problems(moveSchema("fail", step, 0), values(step, { ...base, outcome: "scrap" }))).toEqual(["overrideReason"]);
    expect(problems(moveSchema("fail", step, 0), values(step, { ...base, outcome: "rework", reworkTo: defect.reworkTo! }))).toEqual([]);
    expect(problems(moveSchema("fail", step, 0), values(step, { ...base, outcome: "rework", reworkTo: "", overrideReason: "x" }))).toEqual(["reworkTo"]);
  });

  it("wants a step and comment for a correction", () => {
    const step = finish();
    expect(problems(moveSchema("correction", step, 0), values(step))).toEqual(["toStep", "comment"]);
  });
});

describe("a fail with its target already chosen", () => {
  const FINISH: MoveTarget = { kind: "rework", step: { key: "finish", name: "Finish" } };
  const PRINT: MoveTarget = { kind: "rework", step: { key: "print", name: "Print" } };
  const SCRAP: MoveTarget = { kind: "scrap" };
  const failWith = (step: StepRules, target: MoveTarget, changes: Partial<MoveValues> = {}) =>
    ({ ...emptyMoveValues(step, target), defectId: step.defects[0]!.id, comment: "Pitted", ...changes }) satisfies MoveValues;

  it("starts the form at the target", () => {
    expect(emptyMoveValues(finalQc(), FINISH)).toMatchObject({ changing: true, outcome: "rework", reworkTo: "finish" });
    expect(emptyMoveValues(finalQc(), SCRAP)).toMatchObject({ changing: true, outcome: "scrap", reworkTo: "" });
    expect(emptyMoveValues(finalQc())).toMatchObject({ changing: false, outcome: "" });
  });

  it("sends nothing extra when the target is where the defect usually goes", () => {
    const step = finalQc();
    const body = moveBody("fail", step, ["a"], failWith(step, FINISH));
    expect(body).not.toHaveProperty("outcome");
    expect(body).not.toHaveProperty("rework_to");
    expect(body).not.toHaveProperty("override_reason");
  });

  it("sends the other step and the reason when the target differs", () => {
    const step = finish();
    const body = moveBody("fail", step, ["a"], failWith(step, PRINT, { overrideReason: "Too deep" }));
    expect(body).toMatchObject({ rework_to: "print", override_reason: "Too deep" });
    expect(body).not.toHaveProperty("outcome");
  });

  it("sends a scrap with its reason", () => {
    const step = finalQc();
    expect(moveBody("fail", step, ["a"], failWith(step, SCRAP, { overrideReason: "Too deep" }))).toMatchObject({ outcome: "scrap", override_reason: "Too deep" });
  });

  it("asks why only when the target differs from the usual outcome", () => {
    const step = finalQc();
    expect(problems(moveSchema("fail", step, 0), failWith(step, FINISH))).toEqual([]);
    expect(problems(moveSchema("fail", step, 0), failWith(step, SCRAP))).toEqual(["overrideReason"]);
  });
});

describe("fieldPath", () => {
  it("maps what erp-api names onto the form's fields", () => {
    const step = finish();
    expect(fieldPath("surface_smooth", step)).toBe("answers.surface_smooth");
    expect(fieldPath("photos", step)).toBe("photoVersionIds");
    expect(fieldPath("defect_id", step)).toBe("defectId");
    expect(fieldPath("work_order_ids.0", step)).toBe("work_order_ids.0");
  });
});
