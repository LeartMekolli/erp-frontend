import { describe, expect, it } from "vitest";

import type { Group, WorkflowStep } from "@/lib/api/schema-types";

import { failedOnLine, qualityCards } from "./quality";

type Step = Group["steps"][number];

function at(key: string, name: string, fields: Partial<Step> = {}): Step {
  return { key, name, count: 0, in_rework: 0, passed: 0, failed: 0, not_inspected: 0, defects: [], latest_check: null, ...fields };
}

const steps: Group["steps"] = [
  at("print", "Print", { count: 2 }),
  at("finish", "Finish", { count: 4, in_rework: 1 }),
  at("plating", "Plating"),
  at("packing", "Packing", { count: 1 }),
];

function config(key: string, fields: Partial<WorkflowStep> = {}): WorkflowStep {
  return { key, checklist: [], defects: [], sampling: null, ...fields } as WorkflowStep;
}

const CHECK = { key: "smooth", label: "Smooth", kind: "yes_no", required: true, passing_answer: true } as WorkflowStep["checklist"][number];
const DEFECT = { defect_id: "d", key: "scratch", name: "Scratch", outcome: "scrap", rework_to: null } as WorkflowStep["defects"][number];
const CHECKED = [config("finish", { checklist: [CHECK] })];

describe("qualityCards", () => {
  it("makes a card for each step with a checklist or defects, in path order", () => {
    const { cards } = qualityCards(steps, [config("plating", { defects: [DEFECT] }), config("finish", { checklist: [CHECK] }), config("print"), config("packing")]);
    expect(cards.map((card) => card.key)).toEqual(["finish", "plating"]);
  });

  it("carries the waiting and rework counts", () => {
    const { cards } = qualityCards(steps, CHECKED);
    expect(cards[0]).toMatchObject({ name: "Finish", waiting: 4, inRework: 1, sampling: null });
  });

  it("names the steps with no checks", () => {
    const { noChecks } = qualityCards(steps, [config("print"), config("finish", { checklist: [CHECK] }), config("plating"), config("packing")]);
    expect(noChecks).toEqual(["Print", "Plating", "Packing"]);
  });

  it("carries a step's sampling", () => {
    const sampling = { inspect: 1, of_every: 3 };
    const { cards } = qualityCards(steps, [config("finish", { checklist: [CHECK], sampling })]);
    expect(cards[0]!.sampling).toEqual(sampling);
  });

  it("treats a step missing from the version as having no checks", () => {
    expect(qualityCards(steps.slice(0, 1), []).noChecks).toEqual(["Print"]);
  });

  it("carries the step's checks, keeping erp-api's defect order", () => {
    const check = { actor: { id: "a", name: "Ana Ruiz" }, partner: null, created_at: "2026-11-04T09:00:00Z", photos: [] };
    const defects = [
      { key: "scratch", name: "Scratch", count: 2 },
      { key: "crack", name: "Crack", count: 1 },
    ];
    const { cards } = qualityCards([at("finish", "Finish", { passed: 6, failed: 3, not_inspected: 2, defects, latest_check: check })], CHECKED);
    expect(cards[0]).toMatchObject({ passed: 6, failed: 3, notInspected: 2, defects, latestCheck: check });
  });

  describe("state", () => {
    const stateOf = (fields: Partial<Step>) => qualityCards([at("finish", "Finish", fields)], CHECKED).cards[0]!.state;

    it("puts failures first, even with pieces waiting", () => {
      expect(stateOf({ failed: 2, count: 10, passed: 5 })).toEqual({ kind: "failed", count: 2 });
    });

    it("is waiting when pieces are at the step and none failed", () => {
      expect(stateOf({ count: 10, passed: 5 })).toEqual({ kind: "waiting", count: 10 });
    });

    it("is all through when everything that came passed", () => {
      expect(stateOf({ passed: 12 })).toEqual({ kind: "through" });
    });

    it("is not reached when nothing has come to the step", () => {
      expect(stateOf({})).toEqual({ kind: "not_reached" });
    });

    it("says how many passed so far while pieces are still at earlier steps", () => {
      const path = [at("print", "Print", { count: 3 }), at("plating", "Plating", { count: 0, passed: 2 }), at("finish", "Finish", { passed: 2 })];
      const { cards } = qualityCards(path, [config("finish", { checklist: [CHECK] })]);
      expect(cards[0]!.state).toEqual({ kind: "so_far", passed: 2 });
    });

    it("is all through once no piece is left before the step", () => {
      const path = [at("print", "Print", { passed: 5 }), at("finish", "Finish", { passed: 5 }), at("packing", "Packing", { count: 2 })];
      const { cards } = qualityCards(path, [config("finish", { checklist: [CHECK] })]);
      expect(cards[0]!.state).toEqual({ kind: "through" });
    });
  });
});

describe("failedOnLine", () => {
  it("adds up the failures of every step", () => {
    expect(failedOnLine([at("print", "Print", { failed: 1 }), at("finish", "Finish", { failed: 2 }), at("packing", "Packing")])).toBe(3);
  });

  it("is zero on a line with no failures", () => {
    expect(failedOnLine(steps)).toBe(0);
  });
});
