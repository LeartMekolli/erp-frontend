import { describe, expect, it } from "vitest";

import type { StepGroup } from "../api/schema-types";

import { keepVersion, lineState, pickedLines, pieceIds, pruneLines, toggleLine, togglePiece, versions, type LineSelection } from "./line-selection";
import type { Piece } from "./shape";

function line(id: string, workable: number, version = 1): StepGroup {
  return {
    group: {
      id,
      workflow: { id: "w", name: "Standard production", version },
      product: null,
      source: "order_line",
      due_on: null,
      late: false,
      priority: null,
      partner: null,
    },
    count: workable,
    in_rework: 0,
    workable,
    to_inspect: 0,
    held: 0,
    held_reason: null,
  };
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

const piece = (id: string, mayWork = true): Piece => ({
  id,
  label: id,
  status: "active",
  stepKey: "finish",
  toInspect: null,
  inRework: false,
  mayWork,
  held: null,
  lastMove: null,
});

describe("line selection", () => {
  it("ticks every workable piece of a line, and unticks them again", () => {
    const four = line("a", 4);
    const picked = toggleLine(null, "finish", four, ids("a", 4));
    expect(pieceIds(picked!)).toEqual(ids("a", 4));
    expect(lineState(picked, four)).toBe(true);
    expect(toggleLine(picked, "finish", four, ids("a", 4))).toBeNull();
  });

  it("keeps each picked line as it was listed, to name it while it's hidden", () => {
    const four = line("a", 4);
    const picked = togglePiece(toggleLine(null, "finish", line("b", 2), ids("b", 2)), "finish", four, piece("a-1"));
    expect(picked!.lines.get("a")!.line).toBe(four);
    expect(picked!.lines.get("b")!.line.group.id).toBe("b");
    expect(pruneLines(picked, new Map([["a", new Set(["a-1"])]])).selection!.lines.get("a")!.line).toBe(four);
  });

  it("names the picked lines from the list first, then the hidden ones as they were ticked", () => {
    const picked = toggleLine(toggleLine(null, "finish", line("a", 2), ids("a", 2)), "finish", line("b", 2), ids("b", 2));
    const freshB = line("b", 1);
    expect(pickedLines(picked!, [line("c", 1), freshB]).map((one) => [one.group.id, one.count])).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("is mixed once one piece is taken out", () => {
    const four = line("a", 4);
    const picked = togglePiece(toggleLine(null, "finish", four, ids("a", 4)), "finish", four, piece("a-2"));
    expect(lineState(picked, four)).toBe("indeterminate");
    expect(pieceIds(picked!)).toEqual(["a-1", "a-3", "a-4"]);
    expect(lineState(null, four)).toBe(false);
  });

  it("ticks a mixed line in full", () => {
    const four = line("a", 4);
    const one = togglePiece(null, "finish", four, piece("a-1"));
    expect(lineState(toggleLine(one, "finish", four, ids("a", 4)), four)).toBe(true);
  });

  it("drops a line when its last piece is unticked", () => {
    const four = line("a", 4);
    const one = togglePiece(null, "finish", four, piece("a-1"));
    expect(togglePiece(one, "finish", four, piece("a-1"))).toBeNull();
  });

  it("ignores a piece the person may not work", () => {
    const four = line("a", 4);
    expect(togglePiece(null, "finish", four, piece("a-1", false))).toBeNull();
  });

  it("starts again when a line is picked at another step", () => {
    const picked = toggleLine(null, "finish", line("a", 2), ids("a", 2));
    const elsewhere = toggleLine(picked, "final_qc", line("b", 3), ids("b", 3));
    expect(elsewhere!.stepKey).toBe("final_qc");
    expect(pieceIds(elsewhere!)).toEqual(ids("b", 3));
    expect(togglePiece(picked, "print", line("c", 1), piece("c-1"))).toMatchObject({ stepKey: "print" });
  });

  it("lists the workflow versions picked, and keeps only one", () => {
    let picked: LineSelection | null = toggleLine(null, "finish", line("a", 2, 1), ids("a", 2));
    picked = toggleLine(picked, "finish", line("b", 3, 2), ids("b", 3));
    expect(versions(picked!)).toEqual([1, 2]);
    const kept = keepVersion(picked!, 2);
    expect(versions(kept!)).toEqual([2]);
    expect(pieceIds(kept!)).toEqual(ids("b", 3));
    expect(keepVersion(picked!, 3)).toBeNull();
  });

  it("keeps only the pieces still at the step, and counts the rest", () => {
    const six = line("a", 6);
    const picked = toggleLine(null, "finish", six, ids("a", 6));
    const still = new Map([["a", new Set(["a-1", "a-2", "a-3", "a-4"])]]);
    const { selection, dropped } = pruneLines(picked, still);
    expect(dropped).toBe(2);
    expect(pieceIds(selection!)).toEqual(["a-1", "a-2", "a-3", "a-4"]);
  });

  it("clears when nothing picked is still at the step", () => {
    const picked = toggleLine(null, "finish", line("a", 2), ids("a", 2));
    expect(pruneLines(picked, new Map())).toEqual({ selection: null, dropped: 2 });
    expect(pruneLines(null, new Map())).toEqual({ selection: null, dropped: 0 });
  });
});
