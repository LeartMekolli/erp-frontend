import { describe, expect, it } from "vitest";

import type { MoveBody } from "../../src/lib/api/schema-types";

import type { Answer } from "./orders";
import { groupIdOf } from "./orders-seed";
import { createProductionStore } from "./production";

const NOW = Date.parse("2026-11-04T10:00:00Z");
const GROUP = groupIdOf(1048, 0);
const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";

function store() {
  return createProductionStore(() => NOW);
}

function ok<T>(answer: Answer<T>): T {
  if (!answer.ok) throw new Error(`expected a body, got ${answer.status}`);
  return answer.body;
}

type Store = ReturnType<typeof store>;

const pieces = (s: Store, params: Record<string, string>) => ok(s.pieces(new URLSearchParams({ group_id: GROUP, ...params })));
const idsAt = (s: Store, step_key: string) => pieces(s, { step_key, status: "active" }).data.map((piece) => piece.id);
const countAt = (s: Store, key: string) => ok(s.group(GROUP)).steps.find((step) => step.key === key)!.count;

const passFinish = (ids: string[]): MoveBody => ({
  kind: "pass",
  work_order_ids: ids,
  at_step: "finish",
  answers: [{ item: "surface_smooth", value: true }],
  photo_file_version_ids: ["77777777-0000-4000-8000-000000000001"],
});

describe("fake erp-api production", () => {
  it("counts a line's pieces at each step", () => {
    const group = ok(store().group(GROUP));
    expect(group.quantity).toBe(12);
    expect(group.pieces).toEqual({ active: 10, finished: 1, scrapped: 1 });
    expect(group.steps.map((step) => [step.key, step.count, step.in_rework])).toEqual([
      ["print", 2, 0],
      ["finish", 4, 1],
      ["final_qc", 3, 0],
      ["packing", 1, 0],
    ]);
  });

  it("answers 404 for a group that doesn't exist", () => {
    expect(store().group("00000000-0000-4000-8000-000000000000")).toMatchObject({ ok: false, status: 404 });
  });

  it("lists pieces by step and status", () => {
    const s = store();
    expect(pieces(s, { step_key: "finish", status: "active" }).data.map((piece) => piece.label)).toEqual(["3/12", "4/12", "5/12", "6/12"]);
    expect(pieces(s, { status: "finished" }).data.map((piece) => piece.label)).toEqual(["11/12"]);
    expect(pieces(s, { status: "scrapped" }).data.map((piece) => piece.label)).toEqual(["12/12"]);
  });

  it("pages through pieces with a cursor", () => {
    const s = store();
    const first = pieces(s, { limit: "2" });
    expect(first.data.map((piece) => piece.label)).toEqual(["1/12", "2/12"]);
    const second = pieces(s, { limit: "2", cursor: first.next_cursor! });
    expect(second.data.map((piece) => piece.label)).toEqual(["3/12", "4/12"]);
  });

  it("refuses a filter erp-api doesn't have", () => {
    expect(store().pieces(new URLSearchParams({ colour: "red" }))).toMatchObject({ ok: false, status: 400 });
  });

  it("answers a workflow version with its checks", () => {
    const s = store();
    const { workflow } = ok(s.group(GROUP));
    const steps = ok(s.version(workflow.id, workflow.version)).steps;
    expect(steps.map((step) => step.key)).toEqual(["print", "finish", "final_qc", "packing"]);
    expect(steps[1]).toMatchObject({ done_by: "partner", pass: { min_photos: 1 } });
    expect(steps[2]!.fail.comment_required).toBe(true);
    expect(s.version(workflow.id, 99)).toMatchObject({ ok: false, status: 404 });
  });

  it("passes pieces on to the next step and records the move", () => {
    const s = store();
    const [id] = idsAt(s, "finish");
    expect(ok(s.move(passFinish([id!]), null)).data[0]!.step?.key).toBe("final_qc");
    expect(countAt(s, "finish")).toBe(3);
    const last = ok(s.piece(id!)).history.at(-1)!;
    expect(last).toMatchObject({ kind: "pass", from_step: { key: "finish" }, to_step: { key: "final_qc" } });
  });

  it("finishes a piece passed at the last step", () => {
    const s = store();
    const [id] = idsAt(s, "packing");
    const moved = ok(s.move({ kind: "pass", work_order_ids: [id!], at_step: "packing" }, null)).data[0]!;
    expect(moved).toMatchObject({ status: "finished", step: null });
  });

  it("moves nothing when one piece is at another step", () => {
    const s = store();
    const answer = s.move(passFinish([idsAt(s, "finish")[0]!, idsAt(s, "print")[0]!]), null);
    expect(answer).toMatchObject({ ok: false, status: 409 });
    expect(countAt(s, "finish")).toBe(4);
  });

  it("lists every missing answer and photo on a pass", () => {
    const s = store();
    const answer = s.move({ kind: "pass", work_order_ids: [idsAt(s, "finish")[0]!], at_step: "finish" }, null);
    expect(answer).toEqual({
      ok: false,
      status: 400,
      errors: [
        { path: "surface_smooth", message: "Surface smooth must be answered to pass" },
        { path: "photos", message: "A pass here needs at least 1 photo(s)" },
      ],
    });
  });

  it("sends a failed piece back for rework", () => {
    const s = store();
    const { workflow } = ok(s.group(GROUP));
    const steps = ok(s.version(workflow.id, workflow.version)).steps;
    const porosity = steps[2]!.defects[0]!;
    const [id] = idsAt(s, "final_qc");
    const moved = ok(s.move({ kind: "fail", work_order_ids: [id!], at_step: "final_qc", defect_id: porosity.defect_id, comment: "Pitted" }, null)).data[0]!;
    expect(moved.step?.key).toBe("finish");
    expect(ok(s.group(GROUP)).steps[1]).toMatchObject({ count: 5, in_rework: 2 });
  });

  it("wants a reason to change a defect's outcome", () => {
    const s = store();
    const { workflow } = ok(s.group(GROUP));
    const porosity = ok(s.version(workflow.id, workflow.version)).steps[2]!.defects[0]!;
    const body: MoveBody = { kind: "fail", work_order_ids: [idsAt(s, "final_qc")[0]!], at_step: "final_qc", defect_id: porosity.defect_id, comment: "Pitted", outcome: "scrap" };
    expect(s.move(body, null)).toMatchObject({ ok: false, status: 400, errors: [{ path: "override_reason" }] });
    expect(ok(s.move({ ...body, override_reason: "Too deep" }, null)).data[0]).toMatchObject({ status: "scrapped", step: null });
  });

  it("puts a corrected piece at the named step", () => {
    const s = store();
    const [id] = idsAt(s, "packing");
    const body: MoveBody = { kind: "correction", work_order_ids: [id!], to_step: "print" };
    expect(s.move(body, null)).toMatchObject({ ok: false, status: 400, errors: [{ path: "comment" }] });
    expect(ok(s.move({ ...body, comment: "Moved by mistake" }, null)).data[0]!.step?.key).toBe("print");
  });

  it("replays the same key and refuses it for another move", () => {
    const s = store();
    const [first, second] = idsAt(s, "finish");
    const answer = ok(s.move(passFinish([first!]), "key-1"));
    expect(ok(s.move(passFinish([first!]), "key-1"))).toEqual(answer);
    expect(s.move(passFinish([second!]), "key-1")).toMatchObject({ ok: false, status: 409 });
  });

  it("shows a seeded failure in a piece's history", () => {
    const s = store();
    const inRework = idsAt(s, "finish")[0]!;
    expect(ok(s.piece(inRework)).history.map((move) => move.kind)).toEqual(["pass", "pass", "fail"]);
  });

  it("adds up each step's checks from the seeded moves", () => {
    const steps = ok(store().group(GROUP)).steps;
    const finish = steps.find((step) => step.key === "finish")!;
    expect(finish).toMatchObject({ passed: 6, failed: 1, not_inspected: 0, defects: [{ key: "scratch", name: "Scratch", count: 1 }] });
    const finalQc = steps.find((step) => step.key === "final_qc")!;
    expect(finalQc).toMatchObject({ passed: 2, failed: 1, defects: [{ key: "porosity", name: "Porosity", count: 1 }] });
    expect(finalQc.latest_check).toMatchObject({ actor: { name: "Ana Ruiz" }, partner: null, photos: [{ file_version_id: expect.any(String) }] });
  });

  it("counts a new fail and pass at a step, but not a correction", () => {
    const s = store();
    const scratch = ok(s.version(WORKFLOW_ID, 1)).steps[1]!.defects[0]!;
    const [, one, two] = idsAt(s, "finish");
    ok(s.move({ kind: "fail", work_order_ids: [one!], at_step: "finish", defect_id: scratch.defect_id }, null));
    ok(s.move(passFinish([two!]), null));
    ok(s.move({ kind: "correction", work_order_ids: [two!], to_step: "finish", comment: "Not done" }, null));
    const finish = ok(s.group(GROUP)).steps.find((step) => step.key === "finish")!;
    expect(finish).toMatchObject({ passed: 7, failed: 2, defects: [{ key: "scratch", count: 2 }] });
    expect(finish.latest_check?.created_at).toBe(new Date(NOW).toISOString());
  });

  it("says which listed pieces are being redone and what last happened to them", () => {
    const s = store();
    const [redone, passed] = pieces(s, { step_key: "finish", status: "active" }).data;
    expect(redone).toMatchObject({ in_rework: true, last_move: { kind: "fail", outcome: "rework", from_step: { key: "final_qc" }, defect: { key: "porosity" } } });
    expect(passed).toMatchObject({ in_rework: false, last_move: { kind: "pass", from_step: { key: "print" } } });
    expect(pieces(s, { step_key: "print", status: "active" }).data[0]!.last_move).toBeNull();
  });
});
