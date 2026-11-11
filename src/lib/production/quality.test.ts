import { describe, expect, it } from "vitest";

import type { Group, WorkflowStep } from "@/lib/api/schema-types";

import { qualityCards } from "./quality";

const steps: Group["steps"] = [
  { key: "print", name: "Print", count: 2, in_rework: 0 },
  { key: "finish", name: "Finish", count: 4, in_rework: 1 },
  { key: "plating", name: "Plating", count: 0, in_rework: 0 },
  { key: "packing", name: "Packing", count: 1, in_rework: 0 },
];

function config(key: string, fields: Partial<WorkflowStep> = {}): WorkflowStep {
  return { key, checklist: [], defects: [], sampling: null, ...fields } as WorkflowStep;
}

const CHECK = { key: "smooth", label: "Smooth", kind: "yes_no", required: true, passing_answer: true } as WorkflowStep["checklist"][number];
const DEFECT = { defect_id: "d", key: "scratch", name: "Scratch", outcome: "scrap", rework_to: null } as WorkflowStep["defects"][number];

describe("qualityCards", () => {
  it("makes a card for each step with a checklist or defects, in path order", () => {
    const { cards } = qualityCards(steps, [config("plating", { defects: [DEFECT] }), config("finish", { checklist: [CHECK] }), config("print"), config("packing")]);
    expect(cards.map((card) => card.key)).toEqual(["finish", "plating"]);
  });

  it("carries the waiting and rework counts", () => {
    const { cards } = qualityCards(steps, [config("finish", { checklist: [CHECK] })]);
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
});
