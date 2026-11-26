import { describe, expect, it } from "vitest";

import { nextStepName, pruneSelection } from "./selection";
import type { Piece } from "./shape";

const steps = [
  { key: "print", name: "Print" },
  { key: "packing", name: "Packing" },
];

function piece(id: string, fields: Partial<Piece> = {}): Piece {
  return { id, label: "1/2", status: "active", stepKey: "print", toInspect: null, inRework: false, mayWork: true, held: null, missingSkill: null, lastMove: null, ...fields };
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
    const pieces = [piece("a", { stepKey: "packing" }), piece("b", { mayWork: false })];
    expect(pruneSelection(new Set(["a", "b"]), pieces, "print")).toEqual({ ids: new Set(), dropped: 2 });
  });

  it("ignores pieces that weren't selected", () => {
    expect(pruneSelection(new Set(["a"]), [piece("a"), piece("c")], "print").ids).toEqual(new Set(["a"]));
  });
});
