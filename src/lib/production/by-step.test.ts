import { describe, expect, it } from "vitest";

import { createProductionStore } from "../../../test/fake-erp-api/production";

import type { StepCount } from "../api/schema-types";

import { busiestStep, busiestWorkflow, dueWords, moveTargets } from "./by-step";
import type { StepRules } from "./shape";

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";

const step = (key: string, active: number): StepCount => ({ key, name: key, active, in_rework: 0, workable: active, held: 0 });

function fakeCounts(): StepCount[] {
  const answer = createProductionStore(() => Date.parse("2026-11-04T10:00:00Z")).counts(new URLSearchParams({ workflow_id: WORKFLOW_ID }));
  if (!answer.ok) throw new Error("expected counts");
  return answer.body.steps;
}

describe("busiestWorkflow", () => {
  it("picks the workflow with the most active pieces", () => {
    expect(busiestWorkflow([
      { workflowId: "printed", steps: [step("print", 8), step("finish", 4)] },
      { workflowId: "cast", steps: [step("casting", 40), step("polishing", 34)] },
    ])).toBe("cast");
  });

  it("keeps the first on a tie, and returns null when nothing is in progress", () => {
    expect(busiestWorkflow([{ workflowId: "a", steps: [step("x", 3)] }, { workflowId: "b", steps: [step("y", 3)] }])).toBe("a");
    expect(busiestWorkflow([{ workflowId: "a", steps: [step("x", 0)] }])).toBeNull();
    expect(busiestWorkflow([])).toBeNull();
  });
});

describe("busiestStep", () => {
  it("picks Print over Finish in the fake's counts", () => {
    expect(busiestStep(fakeCounts())).toBe("print");
  });

  it("keeps the earlier step on a tie, and returns null for an empty workflow", () => {
    expect(busiestStep([step("a", 2), step("b", 5), step("c", 5)])).toBe("b");
    expect(busiestStep([step("a", 0), step("b", 0)])).toBeNull();
  });
});

describe("dueWords", () => {
  it("says how far a due day is from today", () => {
    expect(dueWords("2026-11-27", "2026-11-25")).toBe("in 2 days");
    expect(dueWords("2026-11-26", "2026-11-25")).toBe("in 1 day");
    expect(dueWords("2026-11-25", "2026-11-25")).toBe("today");
    expect(dueWords("2026-11-24", "2026-11-25")).toBe("1 day late");
    expect(dueWords("2026-11-22", "2026-11-25")).toBe("3 days late");
    expect(dueWords(null, "2026-11-25")).toBeNull();
  });

  it("counts across a month end", () => {
    expect(dueWords("2026-12-01", "2026-11-29")).toBe("in 2 days");
  });
});

describe("moveTargets", () => {
  const rules = (changes: Partial<StepRules>): StepRules => ({
    key: "finish",
    name: "Finish",
    checklist: [],
    defects: [],
    reworkTargets: [],
    pass: { minPhotos: 0, commentRequired: false },
    fail: { minPhotos: 0, commentRequired: false },
    sampling: null,
    sopFileVersionId: null,
    partnerStep: false,
    ...changes,
  });

  it("offers the step's rework targets, and Scrap when it has a defect", () => {
    const scratch = { id: "d1", key: "scratch", name: "Scratch", outcome: "rework" as const, reworkTo: "finish" };
    expect(moveTargets(rules({ reworkTargets: [{ key: "finish", name: "Finish" }], defects: [scratch] }))).toEqual({
      rework: [{ key: "finish", name: "Finish" }],
      scrap: true,
    });
    expect(moveTargets(rules({}))).toEqual({ rework: [], scrap: false });
  });
});
