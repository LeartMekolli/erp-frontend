import { describe, expect, it } from "vitest";

import { createProductionStore } from "../../../test/fake-erp-api/production";

import type { StepCount, StepGroup } from "../api/schema-types";

import { boardColumns, dropMove, dropTargets, passesAtOnce } from "./board";
import { staffRules } from "./staff";

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";

function fake() {
  const store = createProductionStore(() => Date.parse("2026-11-04T10:00:00Z"));
  const version = store.version(WORKFLOW_ID, 1);
  const counts = store.counts(new URLSearchParams({ workflow_id: WORKFLOW_ID }));
  const lines = store.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "print" }));
  if (!version.ok || !counts.ok || !lines.ok) throw new Error("expected the fake's workflow");
  const path = version.body.steps.map((step) => ({ key: step.key, name: step.name }));
  const rules = (key: string) => staffRules(version.body.steps.find((step) => step.key === key)!, path);
  return { path, rules, counts: counts.body.steps, printLines: lines.body.data };
}

const count = (key: string, active: number): StepCount => ({ key, name: key, active, in_rework: 0, workable: active, held: 0 });

describe("boardColumns", () => {
  it("keeps the current version's steps in path order", () => {
    const { counts, path } = fake();
    expect(boardColumns(counts, path).columns.map((step) => `${step.name} ${step.active}`)).toEqual(["Print 26", "Finish 24", "Final QC 13", "Packing 1"]);
    expect(boardColumns(counts, path).older).toEqual([]);
  });

  it("puts a step only an older version still has pieces at apart, and leaves out an empty one", () => {
    const { counts, path } = fake();
    expect(boardColumns([...counts, count("polish", 3)], path).older.map((step) => step.key)).toEqual(["polish"]);
    expect(boardColumns([...counts, count("polish", 0)], path).older).toEqual([]);
  });

  it("shows a current step the counts left out as empty", () => {
    const { counts, path } = fake();
    const columns = boardColumns(counts.filter((step) => step.key !== "packing"), path).columns;
    expect(columns.at(-1)).toMatchObject({ key: "packing", name: "Packing", active: 0 });
  });
});

describe("dropTargets", () => {
  it("lets a card go on, back to a rework step, or to Scrap", () => {
    const { rules, path } = fake();
    expect(dropTargets(rules("final_qc"), path)).toEqual({ pass: { key: "packing", name: "Packing" }, rework: [{ key: "finish", name: "Finish" }], scrap: true });
    expect(dropTargets(rules("print"), path)).toEqual({ pass: { key: "finish", name: "Finish" }, rework: [], scrap: false });
    expect(dropTargets(rules("packing"), path).pass).toBeNull();
  });
});

describe("dropMove", () => {
  it("passes on the next step, fails back or to Scrap, and does nothing anywhere else", () => {
    const { rules, path } = fake();
    const targets = dropTargets(rules("final_qc"), path);
    expect(dropMove(targets, "packing", "final_qc")).toEqual({ kind: "pass" });
    expect(dropMove(targets, "finish", "final_qc")).toEqual({ kind: "fail", target: { kind: "rework", step: { key: "finish", name: "Finish" } } });
    expect(dropMove(targets, "scrap", "final_qc")).toEqual({ kind: "fail", target: { kind: "scrap" } });
    expect(dropMove(targets, "print", "final_qc")).toBeNull();
    expect(dropMove(targets, "final_qc", "final_qc")).toBeNull();
  });
});

describe("passesAtOnce", () => {
  it("skips the dialog only when the step asks for nothing and nobody else is counted", () => {
    const { rules, printLines } = fake();
    const plain = printLines.filter((line) => line.group.order?.number === 1041);
    expect(passesAtOnce(rules("print"), plain, null)).toBe(true);
    expect(passesAtOnce(rules("finish"), plain, null)).toBe(false);
    const toInspect: StepGroup[] = plain.map((line) => ({ ...line, to_inspect: 1 }));
    expect(passesAtOnce(rules("print"), toInspect, null)).toBe(false);
    expect(passesAtOnce(rules("print"), plain, "Northcast Foundry")).toBe(false);
  });

  it("opens the dialog when the pass needs photos or a comment", () => {
    const { rules, printLines } = fake();
    const print = rules("print");
    expect(passesAtOnce({ ...print, pass: { minPhotos: 1, commentRequired: false } }, printLines, null)).toBe(false);
    expect(passesAtOnce({ ...print, pass: { minPhotos: 0, commentRequired: true } }, printLines, null)).toBe(false);
  });
});
