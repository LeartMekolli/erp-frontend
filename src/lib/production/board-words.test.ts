import { describe, expect, it } from "vitest";

import { createProductionStore } from "../../../test/fake-erp-api/production";

import { cancelledWords, DRAG_INSTRUCTIONS, droppedWords, overWords, pickedUpWords } from "./board-words";

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";

function line1041() {
  const store = createProductionStore(() => Date.parse("2026-11-04T10:00:00Z"));
  const lines = store.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "print" }));
  if (!lines.ok) throw new Error("expected the fake's lines");
  return lines.body.data.find((one) => one.group.order?.number === 1041)!;
}

describe("the Board's drag words", () => {
  it("says what was picked up", () => {
    expect(pickedUpWords(line1041(), 10)).toBe("Picked up #1041, 10 pieces.");
    expect(pickedUpWords(line1041(), 1)).toBe("Picked up #1041, 1 piece.");
  });

  it("says what a drop where the card is would do", () => {
    expect(overWords("Finish", { kind: "pass" })).toBe("Over Finish: pass.");
    expect(overWords("Finish", { kind: "fail", target: { kind: "rework", step: { key: "finish", name: "Finish" } } })).toBe("Over Finish: send back.");
    expect(overWords("Scrap", { kind: "fail", target: { kind: "scrap" } })).toBe("Over Scrap: scrap.");
    expect(overWords("Packing", null)).toBe("Over Packing: can't go here.");
    expect(overWords(null, null)).toBe("Not over a step.");
  });

  it("says where it was dropped, or that it was put back", () => {
    expect(droppedWords("Finish", { kind: "pass" })).toBe("Dropped on Finish.");
    expect(droppedWords("Packing", null)).toBe("Put back. It can't go to Packing.");
    expect(droppedWords(null, null)).toBe("Put back.");
    expect(cancelledWords()).toBe("Put back.");
  });

  it("tells keyboard users how to drag", () => {
    expect(DRAG_INSTRUCTIONS).toBe(
      "To move this card, press Space or Enter, use the arrow keys to reach a step, then press Space or Enter again to drop it. Escape puts it back.",
    );
  });
});
