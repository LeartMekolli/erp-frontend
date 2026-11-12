import { describe, expect, it } from "vitest";

import type { ActionPiece, LineAction, WorkflowStep } from "@/lib/api/schema-types";

import { createProductionStore } from "../../../test/fake-erp-api/production";

import { actionTitle, actorText, groupByDay, isCancel, isMixed, isNotable, nextText, overrideText, pieceName, pieceResult } from "./history";

const NOW = Date.parse("2026-11-12T15:00:00Z");
const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";

const stepRef = (n: number, key: string, name: string) => ({ id: `b0b0b0b0-0000-4000-8000-00000000000${n}`, key, name });
const PRINT = stepRef(1, "print", "Print");
const FINISH = stepRef(2, "finish", "Finish");
const FINAL_QC = stepRef(3, "final_qc", "Final QC");
const PACKING = stepRef(4, "packing", "Packing");
const SCRATCH = { id: "b3b3b3b3-0000-4000-8000-000000000001", key: "scratch", name: "Scratch" };
const POROSITY = { id: "b3b3b3b3-0000-4000-8000-000000000002", key: "porosity", name: "Porosity" };

function piece(fields: Partial<ActionPiece> = {}): ActionPiece {
  return { id: "c0c0c0c0-0000-4000-8000-000000000001", label: "4/10", replacement: false, from_step: FINISH, to_step: FINAL_QC, status: "active", ...fields };
}

function action(fields: Partial<LineAction> = {}): LineAction {
  return {
    id: "d0d0d0d0-0000-4000-8000-000000000001",
    kind: "pass",
    outcome: null,
    from_step: FINISH,
    to_step: FINAL_QC,
    defect: null,
    override_reason: null,
    comment: null,
    answers: [],
    photos: [],
    actor: { id: "55555555-0000-4000-8000-000000000001", name: "Ana Ruiz" },
    partner: null,
    inspected: true,
    created_at: "2026-11-12T14:00:00Z",
    pieces: [piece()],
    ...fields,
  };
}

/** The fake workflow's steps: Finish records Scratch, which is redone at Finish by default. */
function steps(): WorkflowStep[] {
  const answer = createProductionStore(() => NOW).version(WORKFLOW_ID, 1);
  if (!answer.ok) throw new Error("expected the fake's workflow");
  return answer.body.steps;
}

describe("history", () => {
  it("titles a pass by its steps", () => {
    expect(actionTitle(action())).toBe("Passed Finish → Final QC");
    expect(actionTitle(action({ from_step: PACKING, to_step: null }))).toBe("Passed Packing → Finished");
    expect(actionTitle(action({ inspected: false }))).toBe("Passed Finish → Final QC, not inspected");
  });

  it("titles a fail by its step and defect", () => {
    const fail = action({ kind: "fail", outcome: "rework", from_step: FINAL_QC, to_step: FINISH, defect: POROSITY });
    expect(actionTitle(fail)).toBe("Failed at Final QC: Porosity");
    expect(isNotable(fail)).toBe(true);
  });

  it("says where a failed piece goes", () => {
    const fail = (fields: Partial<LineAction>) => action({ kind: "fail", from_step: FINAL_QC, defect: POROSITY, ...fields });
    expect(nextText(fail({ outcome: "rework", to_step: FINISH }))).toBe("→ redo at Finish");
    expect(nextText(fail({ outcome: "scrap", to_step: null }))).toBe("→ scrapped");
    expect(nextText(fail({ outcome: "continue", to_step: PACKING }))).toBe("→ on to Packing");
    expect(nextText(fail({ outcome: "continue", to_step: null }))).toBe("→ finished");
    expect(nextText(action())).toBeNull();
  });

  it("titles a correction by where it put the pieces", () => {
    const correction = action({ kind: "correction", from_step: FINAL_QC, to_step: PRINT, pieces: [piece({ to_step: PRINT })] });
    expect(actionTitle(correction)).toBe("Moved to Print");
    expect(isNotable(correction)).toBe(true);
  });

  it("titles a cancel", () => {
    const cancel = action({
      kind: "correction",
      to_step: null,
      pieces: [piece({ to_step: null, status: "cancelled" }), piece({ id: "c0c0c0c0-0000-4000-8000-000000000002", label: "5/10", to_step: null, status: "cancelled" })],
    });
    expect(actionTitle(cancel)).toBe("Cancelled");
    expect(isCancel(cancel)).toBe(true);
    expect(isNotable(cancel)).toBe(false);
  });

  it("titles a mixed correction by its count", () => {
    const restored = piece({ from_step: null, to_step: PRINT, status: "active" });
    const replacement = piece({ id: "c0c0c0c0-0000-4000-8000-000000000002", replacement: true, from_step: FINISH, to_step: null, status: "cancelled" });
    const mixed = action({ kind: "correction", from_step: null, to_step: null, pieces: [restored, replacement] });
    expect(actionTitle(mixed)).toBe("Corrected 2 pieces");
    expect(isMixed(mixed)).toBe(true);
    expect(isCancel(mixed)).toBe(false);
    expect(isNotable(mixed)).toBe(true);
    expect(pieceName(restored)).toBe("4/10");
    expect(pieceName(replacement)).toBe("4/10, replacement");
    expect(pieceResult(restored)).toBe("At Print");
    expect(pieceResult(replacement)).toBe("Cancelled");
    expect(pieceResult(piece({ to_step: null, status: "scrapped" }))).toBe("Scrapped");
    expect(pieceResult(piece({ to_step: null, status: "finished" }))).toBe("Finished");
  });

  it("isn't mixed when every piece ends the same way", () => {
    expect(isMixed(action({ pieces: [piece(), piece({ id: "c0c0c0c0-0000-4000-8000-000000000002", label: "5/10" })] }))).toBe(false);
  });

  it("explains an override from the defect's default", () => {
    const fail = (fields: Partial<LineAction>) =>
      action({ kind: "fail", from_step: FINISH, defect: SCRATCH, override_reason: "Too deep to save", ...fields });
    expect(overrideText(fail({ outcome: "scrap", to_step: null }), steps())).toBe("Scrapped instead of redone: Too deep to save");
    expect(overrideText(fail({ outcome: "rework", to_step: PRINT }), steps())).toBe("Redone at Print instead of Finish: Too deep to save");
    expect(overrideText(fail({ outcome: "scrap", defect: POROSITY }), steps())).toBe("Changed because: Too deep to save");
    expect(overrideText(fail({ outcome: "scrap", override_reason: null }), steps())).toBeNull();
  });

  it("names who moved for a partner", () => {
    expect(actorText(action())).toBe("Ana Ruiz");
    expect(actorText(action({ actor: { id: "55555555-0000-4000-8000-000000000002", name: "Lena Park" }, partner: { id: "2f1c5d7e-0a9b-4e3c-8d2f-6a5b4c3d2e10", name: "Northcast Foundry" } }))).toBe(
      "Lena Park, for Northcast Foundry",
    );
  });

  it("groups by day, newest first", () => {
    const at = (created_at: string) => action({ created_at });
    const days = groupByDay(
      [at("2026-11-12T14:00:00Z"), at("2026-11-12T09:00:00Z"), at("2026-11-11T20:00:00Z"), at("2026-11-03T10:00:00Z"), at("2025-11-03T10:00:00Z")],
      NOW,
      "UTC",
    );
    expect(days.map((day) => day.heading)).toEqual(["Today", "Yesterday, 11 Nov", "3 Nov", "3 Nov 2025"]);
    expect(days[0]!.actions).toHaveLength(2);
  });

  it("judges days in the workspace's time zone", () => {
    const days = groupByDay([action({ created_at: "2026-11-12T10:30:00Z" })], Date.parse("2026-11-12T12:00:00Z"), "Pacific/Auckland");
    expect(days.map((day) => day.heading)).toEqual(["Yesterday, 12 Nov"]);
  });
});
