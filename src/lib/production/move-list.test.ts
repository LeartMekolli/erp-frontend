import { describe, expect, it } from "vitest";

import type { GroupSummary, MoveListItem } from "@/lib/api/schema-types";

import { DEFAULT_HISTORY, actorLabel, lineName, moveListQuery, moveTime, moveWords, partnersOf, setFilterCount, type HistoryFilters } from "./move-list";

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";
const step = (key: string, name: string) => ({ id: `${key}-id`, key, name });
const POROSITY = { id: "p", key: "porosity", name: "Porosity" };
const CRACK = { id: "c", key: "crack", name: "Crack" };
const SCRATCH = { id: "s", key: "scratch", name: "Scratch" };

type Words = Parameters<typeof moveWords>[0];
const move = (fields: Partial<Words>): Words => ({ kind: "pass", outcome: null, defect: null, to_step: null, inspected: true, ...fields });

const filters = (fields: Partial<HistoryFilters> = {}): HistoryFilters => ({ workflowId: WORKFLOW_ID, ...DEFAULT_HISTORY, ...fields });

function group(fields: Partial<GroupSummary> = {}): GroupSummary {
  return {
    id: "g",
    workflow: { id: WORKFLOW_ID, name: "Standard production", version: 1 },
    product: { id: "pr", name: "Signet ring", options: [], size: null },
    source: "order_line",
    due_on: null,
    late: false,
    priority: null,
    partner: null,
    ...fields,
  };
}

describe("History's words", () => {
  it.each<[string, Words, string]>([
    ["an inspected pass", move({ to_step: step("packing", "Packing") }), "passed"],
    ["a pass left out of the sample", move({ inspected: false, to_step: step("packing", "Packing") }), "passed without inspection"],
    ["a pass off the last step", move({ to_step: null }), "passed"],
    ["a fail sent back", move({ kind: "fail", outcome: "rework", defect: POROSITY, to_step: step("casting", "Casting") }), "failed: Porosity, sent back to Casting"],
    ["a fail whose pieces landed apart", move({ kind: "fail", outcome: "rework", defect: POROSITY, to_step: null }), "failed: Porosity, sent back"],
    ["a scrap", move({ kind: "fail", outcome: "scrap", defect: CRACK }), "scrapped: Crack"],
    ["a defect let through", move({ kind: "fail", outcome: "continue", defect: SCRATCH, to_step: step("packing", "Packing") }), "let through: Scratch"],
    ["a correction to one step", move({ kind: "correction", to_step: step("plating", "Plating") }), "corrected to Plating"],
    ["a correction with no single target", move({ kind: "correction", to_step: null }), "corrected"],
  ])("words %s", (_, given, words) => {
    expect(moveWords(given)).toBe(words);
  });

  it("says how long ago a move was within the hour, then the clock time", () => {
    const now = Date.parse("2026-11-26T10:00:00Z");
    const ago = (ms: number) => moveTime(new Date(now - ms).toISOString(), now, "Europe/Berlin");
    expect(ago(30_000)).toBe("Just now");
    expect(ago(10 * 60_000)).toBe("10 min ago");
    expect(ago(59 * 60_000)).toBe("59 min ago");
    expect(ago(61 * 60_000)).toBe("09:59");
  });

  it("names a line by its order, its claim, or its product for someone who can't read orders", () => {
    expect(lineName(group({ order: { id: "o", number: 1042, line_id: "l" }, claim: null }))).toBe("#1042");
    expect(lineName(group({ source: "claim_line", order: { id: "o", number: 1042, line_id: "l" }, claim: { id: "c", number: 12 } }))).toBe("Claim #12");
    expect(lineName(group())).toBe("Signet ring");
    expect(lineName(group({ source: "quote", product: null }))).toBe("A quote");
  });

  it("names each partner a move counted for once, in order", () => {
    const northcast = { id: "n", name: "Northcast Foundry" };
    const groups = [
      { group: group(), count: 2, partner: northcast },
      { group: group(), count: 1, partner: null },
      { group: group(), count: 3, partner: northcast },
    ];
    expect(partnersOf({ groups } as Pick<MoveListItem, "groups">)).toEqual(["Northcast Foundry"]);
  });

  it("names a workshop's person with their workshops", () => {
    expect(actorLabel({ id: "a", name: "Ana Novak", partners: [] })).toBe("Ana Novak");
    expect(actorLabel({ id: "a", name: "Ana Novak", partners: [{ id: "n", name: "Northcast Foundry" }] })).toBe("Ana Novak · Northcast Foundry");
    expect(
      actorLabel({
        id: "a",
        name: "Ana Novak",
        partners: [
          { id: "l", name: "Layerline Prints" },
          { id: "n", name: "Northcast Foundry" },
        ],
      }),
    ).toBe("Ana Novak · Layerline Prints, Northcast Foundry");
  });
});

describe("History's query", () => {
  it("asks for the last 7 days from midnight in the workspace's zone, every result", () => {
    expect(moveListQuery(filters(), "2026-11-26", "Europe/Berlin")).toEqual({
      workflow_id: WORKFLOW_ID,
      from: "2026-11-19T23:00:00.000Z",
      to: "2026-11-26T23:00:00.000Z",
    });
  });

  it("sends the result, step, defect, person and search only when set", () => {
    const query = moveListQuery(filters({ result: "fail", stepKey: "final_qc", defectKey: "porosity", actorId: "u1", q: "1048" }), "2026-11-26", "UTC");
    expect(query).toMatchObject({ kind: "fail", step_key: "final_qc", defect_key: "porosity", actor_user_id: "u1", q: "1048" });
  });

  it("ends a custom range at the start of the day after it", () => {
    const query = moveListQuery(filters({ range: { from: "2026-11-01", to: "2026-11-03" } }), "2026-11-26", "UTC");
    expect(query).toMatchObject({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-04T00:00:00.000Z" });
  });

  it("counts the filters set besides the result, and a range other than the last 7 days", () => {
    expect(setFilterCount(filters())).toBe(0);
    expect(setFilterCount(filters({ result: "fail" }))).toBe(0);
    expect(setFilterCount(filters({ stepKey: "final_qc", q: "1048" }))).toBe(2);
    expect(setFilterCount(filters({ range: { preset: "30d" } }))).toBe(1);
  });
});
