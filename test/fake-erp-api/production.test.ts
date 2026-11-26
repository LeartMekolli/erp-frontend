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

describe("fake erp-api: Production's lists", () => {
  const counts = (s: Store, params: Record<string, string> = {}) => ok(s.counts(new URLSearchParams({ workflow_id: WORKFLOW_ID, ...params })));
  const groups = (s: Store, params: Record<string, string> = {}) =>
    ok(s.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "finish", ...params })));
  const numbers = (page: { data: { group: { order?: { number: number } | null } }[] }) => page.data.map((row) => row.group.order?.number);

  it("lists the workflows with their current version", () => {
    expect(ok(store().workflows()).data).toEqual([{ id: WORKFLOW_ID, key: "standard", name: "Standard production", version: 1 }]);
  });

  it("counts the active pieces at each step in path order", () => {
    expect(counts(store()).steps).toEqual([
      // #1045's one piece waits for payment: held, so never workable.
      { key: "print", name: "Print", active: 26, in_rework: 0, workable: 25, held: 1 },
      { key: "finish", name: "Finish", active: 24, in_rework: 1, workable: 24, held: 0 },
      { key: "final_qc", name: "Final QC", active: 13, in_rework: 0, workable: 13, held: 0 },
      { key: "packing", name: "Packing", active: 1, in_rework: 0, workable: 1, held: 0 },
    ]);
  });

  it("holds every piece of an order waiting for payment, so none is workable", () => {
    const s = store();
    const unpaid = groupIdOf(1045, 0);
    const [piece] = ok(s.pieces(new URLSearchParams({ group_id: unpaid, step_key: "print", status: "active" }))).data;
    expect(piece).toMatchObject({ held: "waiting_for_payment", may_work: false });
    const row = groups(s, { step_key: "print" }).data.find((one) => one.group.id === unpaid);
    expect(row).toMatchObject({ count: 1, workable: 0, held: 1, held_reason: "waiting_for_payment" });
    expect(groups(s, { step_key: "print", workable: "true" }).data.some((one) => one.group.id === unpaid)).toBe(false);
    expect(groups(s).data.every((one) => one.held === 0 && one.held_reason === null)).toBe(true);
  });

  it("holds an assembly's pieces while its parts aren't ready, payment first", () => {
    const s = store();
    s.waitForParts(groupIdOf(1049, 0));
    s.waitForParts(groupIdOf(1045, 0));
    const listed = ok(s.pieces(new URLSearchParams({ group_id: groupIdOf(1049, 0), status: "active" }))).data;
    expect(listed.every((one) => one.held === "waiting_for_parts" && !one.may_work)).toBe(true);
    const rows = groups(s, { step_key: "print" }).data;
    expect(rows.find((one) => one.group.id === groupIdOf(1049, 0))).toMatchObject({ held: 4, held_reason: "waiting_for_parts", workable: 0 });
    expect(rows.find((one) => one.group.id === groupIdOf(1045, 0))).toMatchObject({ held_reason: "waiting_for_payment" });
    expect(counts(s).steps[0]).toMatchObject({ active: 26, workable: 21, held: 5 });
  });

  it("leaves a piece not active unheld", () => {
    const s = store();
    s.waitForParts(GROUP);
    const done = ok(s.pieces(new URLSearchParams({ group_id: GROUP, status: "finished" }))).data;
    expect(done.map((one) => one.held)).toEqual([null]);
  });

  it("refuses to move an assembly's pieces onward while its parts aren't ready, but not back to the first step", () => {
    const s = store();
    s.waitForParts(GROUP);
    const [first] = idsAt(s, "finish");
    expect(s.move(passFinish([first!]), null)).toEqual({
      ok: false,
      status: 409,
      detail: "The parts are not ready yet",
      errors: [{ path: "work_order_ids.0", message: "3/12 waits for its parts" }],
    });
    ok(s.move({ kind: "correction", work_order_ids: [first!], to_step: "print", comment: "Start again" }, null));
    expect(idsAt(s, "print")).toContain(first);
  });

  it("counts only what the caller may work with workable=true", () => {
    const s = store();
    s.requireSkill("finish");
    expect(counts(s).steps[1]).toMatchObject({ active: 24, workable: 0 });
    expect(counts(s, { workable: "true" }).steps[1]).toMatchObject({ active: 0, workable: 0 });
    expect(ok(s.counts(new URLSearchParams({ workflow_id: WORKFLOW_ID }), { permissions: ["workflow.read"] })).steps[0]!.workable).toBe(0);
  });

  it("refuses counts for a workflow that doesn't exist, or without one", () => {
    const s = store();
    expect(s.counts(new URLSearchParams({ workflow_id: "00000000-0000-4000-8000-000000000000" }))).toMatchObject({ ok: false, status: 404 });
    expect(s.counts(new URLSearchParams())).toMatchObject({ ok: false, status: 400, errors: [{ path: "workflow_id" }] });
  });

  it("lists the order lines at a step, due soonest first", () => {
    const page = groups(store(), { sort: "due_on" });
    expect(numbers(page)).toEqual([1041, 1048]);
    const [first, second] = page.data;
    expect(first).toMatchObject({
      count: 20,
      in_rework: 0,
      workable: 20,
      to_inspect: 0,
      group: { due_on: "2026-11-02", late: true, customer: { name: "Fieldnote Studio" }, product: { name: "Bracket", options: [], size: null }, partner: null, priority: null },
    });
    expect(first!.group.workflow).toEqual({ id: WORKFLOW_ID, name: "Standard production", version: 1 });
    expect(second).toMatchObject({
      count: 4,
      in_rework: 1,
      group: { due_on: "2026-11-04", late: false, order: { number: 1048 }, partner: { name: "Northcast Foundry", due_on: "2026-11-02", late: true } },
    });
    expect(numbers(groups(store(), { sort: "-due_on" }))).toEqual([1048, 1041]);
  });

  it("pages the order lines with a cursor", () => {
    const s = store();
    const first = groups(s, { sort: "due_on", limit: "1" });
    expect(numbers(first)).toEqual([1041]);
    expect(numbers(groups(s, { sort: "due_on", limit: "1", cursor: first.next_cursor! }))).toEqual([1048]);
  });

  it("wants a step for the order lines", () => {
    expect(store().stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID }))).toMatchObject({ ok: false, status: 400, errors: [{ path: "step_key" }] });
  });

  it("leaves out the order and the customer the caller can't read", () => {
    const row = ok(store().stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "finish" }), { permissions: ["workflow.read"] })).data[0]!;
    expect(row.group).not.toHaveProperty("order");
    expect(row.group).not.toHaveProperty("customer");
    expect(row.group.product?.name).toBeDefined();
  });

  it("names the skill a step requires that the caller lacks, on lines and pieces", () => {
    const s = store();
    expect(groups(s).data[0]!.missing_skill).toBeNull();
    s.requireSkill("finish");
    for (const row of groups(s).data) expect(row.missing_skill).toMatchObject({ name: "Finish" });
    const piece = ok(s.pieces(new URLSearchParams({ group_id: GROUP, step_key: "finish", status: "active" }))).data[0]!;
    expect(piece.missing_skill).toMatchObject({ name: "Finish" });
  });

  it("names no missing skill without workflow.move, or for a piece that isn't active", () => {
    const s = store();
    s.requireSkill("finish");
    const reader = { permissions: ["workflow.read"] };
    expect(ok(s.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "finish" }), reader)).data[0]!.missing_skill).toBeNull();
    expect(ok(s.pieces(new URLSearchParams({ group_id: GROUP, step_key: "finish", status: "active" }), reader)).data[0]!.missing_skill).toBeNull();
    const finished = ok(s.pieces(new URLSearchParams({ group_id: GROUP, status: "finished" }))).data;
    for (const piece of finished) expect(piece.missing_skill).toBeNull();
  });

  it("searches by order number, product or customer", () => {
    const s = store();
    expect(numbers(groups(s, { q: "1041" }))).toEqual([1041]);
    expect(numbers(groups(s, { q: "#1048" }))).toEqual([1048]);
    expect(numbers(groups(s, { q: "fieldnote" }))).toEqual([1041]);
    expect(numbers(groups(s, { q: "RING" }))).toEqual([1048]);
    expect(counts(s, { q: "1041" }).steps.map((step) => step.active)).toEqual([10, 20, 10, 0]);
  });

  it("gives each listed piece its line's summary", () => {
    const s = store();
    const row = groups(s).data.find((one) => one.group.order?.number === 1048)!;
    const piece = ok(s.pieces(new URLSearchParams({ group_id: GROUP, step_key: "finish", status: "active" }))).data[0]!;
    expect(piece.group).toEqual(row.group);
  });

  it("narrows and sorts the work list", () => {
    const s = store();
    const listed = ok(s.pieces(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "finish", status: "active", sort: "-due_on", limit: "200", q: "luna" }))).data;
    expect(listed).toHaveLength(4);
    expect(listed.every((piece) => piece.group_id === GROUP)).toBe(true);
  });

  it("names every piece that already moved on a 409", () => {
    const s = store();
    const [first, second] = idsAt(s, "finish");
    ok(s.move(passFinish([second!]), null));
    expect(s.move(passFinish([first!, second!]), null)).toEqual({
      ok: false,
      status: 409,
      detail: "Some pieces cannot make this move",
      errors: [{ path: "work_order_ids.1", message: "4/12 is at final_qc, not finish" }],
    });
    expect(countAt(s, "finish")).toBe(3);
  });

  it("refuses to move the pieces of an order waiting for payment, naming each", () => {
    const s = store();
    const [piece] = ok(s.pieces(new URLSearchParams({ group_id: groupIdOf(1045, 0), step_key: "print", status: "active" }))).data;
    expect(s.move({ kind: "pass", work_order_ids: [piece!.id], at_step: "print" }, null)).toEqual({
      ok: false,
      status: 409,
      detail: "The order is waiting for payment",
      errors: [{ path: "work_order_ids.0", message: "1/1: The order is waiting for payment" }],
    });
  });

  it("says no piece may be worked without workflow.move", () => {
    const listed = ok(store().pieces(new URLSearchParams({ group_id: GROUP, step_key: "finish", status: "active" }), { permissions: ["workflow.read"] })).data;
    expect(listed.every((piece) => piece.may_work === false)).toBe(true);
  });
});

describe("fake erp-api: a line's moves", () => {
  const moves = (s: Store, params: Record<string, string> = {}) => ok(s.moves(GROUP, new URLSearchParams(params)));

  it("one move is one action", () => {
    const s = store();
    const [one, two] = idsAt(s, "finish").slice(1);
    ok(s.move(passFinish([two!, one!]), null));
    const first = moves(s).data[0]!;
    expect(first).toMatchObject({ kind: "pass", from_step: { key: "finish" }, to_step: { key: "final_qc" } });
    const labels = [ok(s.piece(one!)).label, ok(s.piece(two!)).label];
    expect(first.pieces.map((piece) => piece.label)).toEqual(labels);
    expect(ok(s.piece(one!)).history.at(-1)!.move_id).toBe(first.id);
    expect(ok(s.piece(two!)).history.at(-1)!.move_id).toBe(first.id);
  });

  it("seeds passes made together as one action", () => {
    const fromFinish = moves(store(), { limit: "200" }).data.filter((action) => action.kind === "pass" && action.from_step?.key === "finish");
    expect(Math.max(...fromFinish.map((action) => action.pieces.length))).toBeGreaterThanOrEqual(3);
  });

  it("keeps fails and corrections under only=fails", () => {
    const s = store();
    const all = moves(s, { limit: "200" });
    const fails = moves(s, { limit: "200", only: "fails" });
    expect(all.counts.fails).toBe(2);
    expect(fails.counts).toEqual(all.counts);
    expect(fails.data).toHaveLength(2);
    for (const action of fails.data) expect(action.kind === "fail" || (action.kind === "correction" && action.to_step !== null)).toBe(true);
    expect(all.data).toHaveLength(all.counts.all);
  });

  it("pages by action", () => {
    const s = store();
    const first = moves(s, { limit: "1" });
    expect(first.data).toHaveLength(1);
    expect(first.next_cursor).not.toBeNull();
    const second = moves(s, { limit: "1", cursor: first.next_cursor! });
    expect(second.data).toHaveLength(1);
    expect(second.data[0]!.id).not.toBe(first.data[0]!.id);
  });

  it("says each piece's status after the move", () => {
    const s = store();
    const scrap = moves(s, { limit: "200" }).data.find((action) => action.outcome === "scrap")!;
    expect(scrap.pieces.map((piece) => piece.status)).toEqual(["scrapped"]);
    const [id] = idsAt(s, "final_qc");
    ok(s.move({ kind: "correction", work_order_ids: [id!], to_step: "print", comment: "Not printed right" }, null));
    expect(moves(s).data[0]!).toMatchObject({ kind: "correction", to_step: { key: "print" }, comment: "Not printed right", pieces: [{ id, status: "active", to_step: { key: "print" } }] });
  });

  it("refuses an unknown filter or group", () => {
    const s = store();
    expect(s.moves(GROUP, new URLSearchParams({ only: "all" }))).toMatchObject({ ok: false, status: 400, errors: [{ path: "only" }] });
    expect(s.moves("99999999-0000-4000-8000-000000000001", new URLSearchParams())).toMatchObject({ ok: false, status: 404 });
  });
});
