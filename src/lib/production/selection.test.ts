import { describe, expect, it } from "vitest";

import type { Group, WorkOrderListItem } from "@/lib/api/schema-types";

import { nextStepName, pruneSelection } from "./selection";

const steps: Group["steps"] = [
  { key: "print", name: "Print", count: 1, in_rework: 0 },
  { key: "packing", name: "Packing", count: 0, in_rework: 0 },
];

function piece(id: string, fields: Partial<WorkOrderListItem> = {}): WorkOrderListItem {
  return {
    id,
    group_id: "g",
    number: 1,
    label: "1/2",
    status: "active",
    step: { id: "s", key: "print", name: "Print" },
    replaces_id: null,
    created_at: "2026-11-04T10:00:00.000Z",
    to_inspect: null,
    may_work: true,
    ...fields,
  };
}

describe("nextStepName", () => {
  it("names the step after this one", () => {
    expect(nextStepName(steps, "print")).toBe("Packing");
  });

  it("is null at the last step and for an unknown one", () => {
    expect(nextStepName(steps, "packing")).toBeNull();
    expect(nextStepName(steps, "gone")).toBeNull();
  });
});

describe("pruneSelection", () => {
  it("keeps pieces still at the step", () => {
    const result = pruneSelection(new Set(["a", "b"]), [piece("a"), piece("b")], "print");
    expect([...result.ids]).toEqual(["a", "b"]);
    expect(result.dropped).toBe(0);
  });

  it("drops a piece no longer listed at the step", () => {
    const result = pruneSelection(new Set(["a", "b"]), [piece("b")], "print");
    expect([...result.ids]).toEqual(["b"]);
    expect(result.dropped).toBe(1);
  });

  it("drops a piece at another step, or one that can't be worked now", () => {
    const pieces = [piece("a", { step: { id: "t", key: "packing", name: "Packing" } }), piece("b", { may_work: false })];
    expect(pruneSelection(new Set(["a", "b"]), pieces, "print")).toEqual({ ids: new Set(), dropped: 2 });
  });

  it("ignores pieces that weren't selected", () => {
    expect(pruneSelection(new Set(["a"]), [piece("a"), piece("c")], "print").ids).toEqual(new Set(["a"]));
  });
});
