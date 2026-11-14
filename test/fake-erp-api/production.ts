/**
 * The fake erp-api's production: one four-step workflow and the pieces of two
 * order lines, spread across its steps. It keeps the rules the order page
 * depends on (erp-api `src/modules/workflow/`): every piece of a move at
 * `at_step` or nothing moves (`moves.service.ts:249`), the QC gate listing each
 * problem (`qc-gate.ts`), and a reason for overriding a defect's outcome.
 */

import type {
  ActionPiece,
  Group,
  LineAction,
  MoveBody,
  MoveHistory,
  PartnerJobDetail,
  PartnerMoveHistory,
  PartnerWorkOrder,
  paths,
  Transition,
  WorkflowStep,
  WorkflowVersion,
  WorkOrderDetail,
  WorkOrderListItem,
} from "../../src/lib/api/schema-types";

import type { Answer, FieldError, Page } from "./orders";
import { groupIdOf, uuid } from "./orders-seed";

type MoveResponse = paths["/workflow/moves"]["post"]["responses"][200]["content"]["application/json"];
type PieceStatus = WorkOrderListItem["status"];

const WORKFLOW = { id: uuid("b2b2b2b2", 1), name: "Standard production", version: 1 };
const ACTOR = { id: uuid("55555555", 1), name: "Ana Ruiz" };
const NO_EVIDENCE = { min_photos: 0, comment_required: false };
const HOUR = 3_600_000;

function step(position: number, key: string, name: string, config: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: uuid("b0b0b0b0", position + 1),
    position,
    key,
    name,
    step_type: { id: uuid("b1b1b1b1", position + 1), key, name, priced: false },
    checklist: [],
    defects: [],
    rework_targets: [],
    pass: NO_EVIDENCE,
    fail: NO_EVIDENCE,
    sop_file_version_id: null,
    expected_minutes: null,
    customer: { visible: false },
    done_by: "workspace",
    required_skill_id: null,
    sampling: null,
    ...config,
  };
}

/** Finish's instructions, the only step with any. */
const SOP = { file_id: uuid("c3c3c3c3", 1), file_version_id: uuid("c4c4c4c4", 1) };

const SCRATCH = { defect_id: uuid("b3b3b3b3", 1), key: "scratch", name: "Scratch", outcome: "rework" as const, rework_to: "finish" };
const POROSITY = { defect_id: uuid("b3b3b3b3", 2), key: "porosity", name: "Porosity", outcome: "rework" as const, rework_to: "finish" };

const STEPS: WorkflowStep[] = [
  step(0, "print", "Print"),
  step(1, "finish", "Finish", {
    checklist: [{ key: "surface_smooth", label: "Surface smooth", kind: "yes_no", required: true, passing_answer: true }],
    defects: [SCRATCH],
    rework_targets: ["finish"],
    pass: { min_photos: 1, comment_required: false },
    done_by: "partner",
    sop_file_version_id: SOP.file_version_id,
  }),
  step(2, "final_qc", "Final QC", {
    defects: [POROSITY],
    rework_targets: ["finish"],
    fail: { min_photos: 0, comment_required: true },
  }),
  step(3, "packing", "Packing"),
];

interface SeedGroup {
  number: number;
  position: number;
  /** How many active pieces wait at each step. */
  at: Partial<Record<string, number>>;
  /** The step whose first piece is being redone. */
  rework?: string;
  finished?: number;
  scrapped?: number;
}

const GROUPS: SeedGroup[] = [
  { number: 1048, position: 0, at: { print: 2, finish: 4, final_qc: 3, packing: 1 }, rework: "finish", finished: 1, scrapped: 1 },
  { number: 1041, position: 0, at: { print: 10, finish: 20, final_qc: 10 } },
  { number: 1045, position: 0, at: { print: 1 } },
  { number: 1049, position: 0, at: { print: 4 } },
  { number: 1049, position: 1, at: { print: 1 } },
  { number: 1049, position: 2, at: { print: 8 } },
];

interface StoredPiece {
  id: string;
  groupId: string;
  number: number;
  quantity: number;
  status: PieceStatus;
  stepKey: string | null;
  inRework: boolean;
  createdAt: string;
  history: Transition[];
}

const ref = (key: string | null) => {
  const found = STEPS.find((s) => s.key === key);
  return found ? { id: found.id, key: found.key, name: found.name } : null;
};

const nextKey = (key: string) => STEPS[STEPS.findIndex((s) => s.key === key) + 1]?.key ?? null;

function transition(fields: Pick<Transition, "kind" | "from_step" | "to_step" | "created_at"> & Partial<Transition>): Transition {
  const id = crypto.randomUUID();
  return {
    id,
    // The rows one request writes share it, as in erp-api; a row given none is an action of its own.
    move_id: id,
    outcome: null,
    defect: null,
    override_reason: null,
    comment: null,
    answers: [],
    photo_file_version_ids: [],
    photos: [],
    actor: ACTOR,
    partner: null,
    inspected: true,
    ...fields,
  };
}

function passesBefore(stepIndex: number, at: (hoursAgo: number) => string): Transition[] {
  return STEPS.slice(0, stepIndex).map((s, index) =>
    transition({ kind: "pass", from_step: ref(s.key), to_step: ref(nextKey(s.key)), created_at: at(stepIndex - index + 1) }),
  );
}

function seedPieces(now: number): StoredPiece[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
  return GROUPS.flatMap((group) => {
    const groupId = groupIdOf(group.number, group.position);
    const waiting = STEPS.map((s) => group.at[s.key] ?? 0);
    const quantity = waiting.reduce((sum, n) => sum + n, 0) + (group.finished ?? 0) + (group.scrapped ?? 0);
    const pieces: StoredPiece[] = [];
    // Seeded passes at the same step and hour were made together: one action.
    const together = new Map<string, string>();
    const passesFor = (stepIndex: number) =>
      passesBefore(stepIndex, at).map((move) => {
        const key = `${move.from_step?.key}|${move.created_at}`;
        if (!together.has(key)) together.set(key, move.move_id);
        return { ...move, move_id: together.get(key)! };
      });
    const add = (fields: Pick<StoredPiece, "status" | "stepKey" | "history"> & { inRework?: boolean }) => {
      const number = pieces.length + 1;
      pieces.push({
        id: uuid("c0c0c0c0", group.number * 1000 + number),
        groupId,
        number,
        quantity,
        createdAt: at(72),
        inRework: false,
        ...fields,
      });
    };

    STEPS.forEach((s, index) => {
      for (let n = 0; n < waiting[index]!; n += 1) {
        if (n === 0 && group.rework === s.key) {
          const failed = transition({
            kind: "fail",
            outcome: "rework",
            from_step: ref("final_qc"),
            to_step: ref(s.key),
            defect: { id: POROSITY.defect_id, key: POROSITY.key, name: POROSITY.name },
            comment: "Pitted along one edge",
            answers: [{ item: "surface_smooth", label: "Surface smooth", value: "false", value_label: null, note: null, passing: false }],
            photo_file_version_ids: [uuid("c1c1c1c1", 1)],
            photos: [{ file_id: uuid("c2c2c2c2", 1), file_version_id: uuid("c1c1c1c1", 1) }],
            created_at: at(1),
          });
          add({ status: "active", stepKey: s.key, inRework: true, history: [...passesFor(index + 1), failed] });
        } else {
          add({ status: "active", stepKey: s.key, history: passesFor(index) });
        }
      }
    });
    for (let n = 0; n < (group.finished ?? 0); n += 1) add({ status: "finished", stepKey: null, history: passesFor(STEPS.length) });
    for (let n = 0; n < (group.scrapped ?? 0); n += 1) {
      const scrapped = transition({
        kind: "fail",
        outcome: "scrap",
        from_step: ref("finish"),
        to_step: null,
        defect: { id: SCRATCH.defect_id, key: SCRATCH.key, name: SCRATCH.name },
        override_reason: "Too deep to save",
        created_at: at(2),
      });
      add({ status: "scrapped", stepKey: null, history: [...passesFor(1), scrapped] });
    }
    return pieces;
  });
}

/**
 * A step's checks from its group's moves, as erp-api adds them up (`progress.ts` `stepTotals`): passes and
 * fails made at the step, never corrections; defects most frequent first, then by name; the latest
 * inspected pass or fail.
 */
function checksAt(
  stepKey: string,
  members: StoredPiece[],
): Pick<Group["steps"][number], "passed" | "failed" | "not_inspected" | "defects"> & { latest: Transition | null } {
  const moves = members.flatMap((piece) => piece.history).filter((move) => move.from_step?.key === stepKey && move.kind !== "correction");
  const passes = moves.filter((move) => move.kind === "pass");
  const counts = new Map<string, { key: string; name: string; count: number }>();
  for (const move of moves) {
    if (move.kind !== "fail" || !move.defect) continue;
    const seen = counts.get(move.defect.key) ?? { key: move.defect.key, name: move.defect.name, count: 0 };
    counts.set(move.defect.key, { ...seen, count: seen.count + 1 });
  }
  return {
    passed: passes.length,
    failed: moves.length - passes.length,
    not_inspected: passes.filter((move) => !move.inspected).length,
    defects: [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    latest: moves.filter((move) => move.inspected).reduce<Transition | null>((last, move) => (!last || move.created_at >= last.created_at ? move : last), null),
  };
}

/** The steps a partner holding a job does (`done_by: "partner"`); the rest are the workspace's. */
const PARTNER_STEPS = STEPS.filter((s) => s.done_by === "partner");

/** Where an active piece stands for the partner (erp-api `partner-stage.ts`): at its step, before one, or past them all. */
function stageOf(piece: StoredPiece): PartnerJobDetail["work_orders"][number]["stage"] {
  if (piece.status !== "active" || piece.stepKey === null) return null;
  const at = STEPS.findIndex((s) => s.key === piece.stepKey);
  if (STEPS[at]?.done_by === "partner") return "yours";
  return STEPS.slice(at + 1).some((s) => s.done_by === "partner") ? "not_yet" : "done";
}

/** Who made a move, by a partner's person or else the workspace's. */
interface Mover {
  actor: { id: string; name: string };
  partner: { id: string; name: string };
}

/** An answer as erp-api records it, named from the step's checklist (its key once the item is gone). */
function answerOf(step: WorkflowStep | undefined, answer: NonNullable<MoveBody["answers"]>[number]): Transition["answers"][number] {
  const item = step?.checklist.find((candidate) => candidate.key === answer.item);
  const value = String(answer.value);
  const option = item?.kind === "choice" ? item.options.find((candidate) => candidate.key === value) : undefined;
  return { item: answer.item, label: item?.label ?? answer.item, value, value_label: option?.label ?? null, note: answer.note ?? null, passing: true };
}

const invalid = (path: string, message: string): Answer<never> => ({ ok: false, status: 400, errors: [{ path, message }] });

const LIST_KEYS = ["limit", "cursor", "group_id", "step_key", "status", "workable"];
const MOVES_KEYS = ["limit", "cursor", "only"];

type Row = { piece: StoredPiece; move: Transition };

/** A piece's status after its row: a correction to no step cancels it, as erp-api records a cancel. */
function statusAfter(move: Transition): ActionPiece["status"] {
  if (move.kind === "correction" && !move.to_step) return "cancelled";
  if (move.kind === "fail" && move.outcome === "scrap") return "scrapped";
  return move.to_step ? "active" : "finished";
}

/** A fail, or a correction that put a piece at a step (erp-api `move-history.ts:29`). */
const isFailRow = ({ move }: Row) => move.kind === "fail" || (move.kind === "correction" && move.to_step !== null);

/** The step every row shares by id; null when they differ. */
function shared(steps: Transition["from_step"][]): Transition["from_step"] {
  const first = steps[0] ?? null;
  return steps.every((step) => step?.id === first?.id) ? first : null;
}

/**
 * One action from its rows in this group, as erp-api builds it (`move-history.ts:95`): pieces in label
 * order, and what the rows share read from the first that didn't cancel its piece.
 */
function actionOf(rows: Row[]): LineAction {
  const sorted = [...rows].sort((a, b) => a.piece.number - b.piece.number);
  const { move } = sorted.find((row) => statusAfter(row.move) !== "cancelled") ?? sorted[0]!;
  return {
    id: move.move_id,
    kind: move.kind,
    outcome: move.outcome,
    from_step: shared(sorted.map((row) => row.move.from_step)),
    to_step: shared(sorted.map((row) => row.move.to_step)),
    defect: move.defect,
    override_reason: move.override_reason,
    comment: move.comment,
    answers: move.answers,
    photos: move.photos,
    actor: move.actor,
    partner: sorted.find((row) => row.move.partner)?.move.partner ?? null,
    inspected: move.inspected,
    created_at: move.created_at,
    pieces: sorted.map((row) => ({
      id: row.piece.id,
      label: `${row.piece.number}/${row.piece.quantity}`,
      replacement: false,
      from_step: row.move.from_step,
      to_step: row.move.to_step,
      status: statusAfter(row.move),
    })),
  };
}

export function createProductionStore(now: () => number) {
  const pieces = new Map(seedPieces(now()).map((piece) => [piece.id, piece]));
  const keys = new Map<string, { input: string; body: MoveResponse }>();
  const skilled = new Set<string>();
  /** The partner whose person made each move, by move id; staff's moves aren't here. */
  const movers = new Map<string, string>();
  const createdAt = () => new Date(now()).toISOString();

  /**
   * Who made a move as a partner reads it (erp-api `partner-view.ts` `actorOf`): its own people by name,
   * another partner's and the workspace's by kind alone.
   */
  const actorFor = (moveId: string, name: string, partnerId: string): PartnerWorkOrder["history"][number]["actor"] => {
    const by = movers.get(moveId);
    if (by === undefined) return { kind: "workspace", name: null };
    return by === partnerId ? { kind: "own", name } : { kind: "other_partner", name: null };
  };

  /** A piece's move as a partner reads it: what was written only on its own people's moves. */
  const partnerTransition = (move: Transition, partnerId: string): PartnerWorkOrder["history"][number] => {
    const actor = actorFor(move.move_id, move.actor.name, partnerId);
    const own = actor.kind === "own";
    return {
      id: move.id,
      move_id: move.move_id,
      kind: move.kind,
      outcome: move.outcome,
      from_step: move.from_step,
      to_step: move.to_step,
      defect: move.defect,
      override_reason: own ? move.override_reason : null,
      comment: own ? move.comment : null,
      answers: move.answers.map((answer) => ({ ...answer, note: own ? answer.note : null })),
      photo_file_version_ids: move.photo_file_version_ids,
      photos: move.photos,
      inspected: move.inspected,
      created_at: move.created_at,
      actor,
    };
  };

  const members = (groupId: string) => [...pieces.values()].filter((piece) => piece.groupId === groupId);

  const base = (piece: StoredPiece) => ({
    id: piece.id,
    group_id: piece.groupId,
    number: piece.number,
    label: `${piece.number}/${piece.quantity}`,
    status: piece.status,
    step: ref(piece.stepKey),
    replaces_id: null,
    created_at: piece.createdAt,
  });

  const listItem = (piece: StoredPiece): WorkOrderListItem => {
    const last = piece.history.at(-1);
    return {
      ...base(piece),
      to_inspect: null,
      may_work: piece.status === "active" && !skilled.has(piece.stepKey ?? ""),
      in_rework: piece.status === "active" && piece.inRework,
      last_move: last
        ? { kind: last.kind, outcome: last.outcome, from_step: last.from_step, defect: last.defect, actor: last.actor, partner: last.partner, created_at: last.created_at }
        : null,
    };
  };

  function advance(piece: StoredPiece, from: string) {
    const next = nextKey(from);
    piece.stepKey = next;
    piece.status = next ? "active" : "finished";
    piece.inRework = false;
  }

  /** What the step asks of a pass or a fail, each problem under its own path (`qc-gate.ts:82-115`). */
  function gate(body: MoveBody, step: WorkflowStep): FieldError[] {
    const problems: FieldError[] = [];
    if (body.kind === "pass") {
      for (const item of step.checklist.filter((i) => i.required)) {
        const answer = body.answers?.find((a) => a.item === item.key);
        if (answer === undefined) problems.push({ path: item.key, message: `${item.label} must be answered to pass` });
        else if (item.kind === "yes_no" && answer.value !== item.passing_answer) problems.push({ path: item.key, message: `${item.label} does not pass its check` });
      }
    }
    if (body.kind === "fail" && !step.defects.some((d) => d.defect_id === body.defect_id)) {
      problems.push({ path: "defect_id", message: body.defect_id ? "This defect is not one this step records" : "A fail names the defect found" });
    }
    const evidence = body.kind === "pass" ? step.pass : step.fail;
    if ((body.photo_file_version_ids?.length ?? 0) < evidence.min_photos) {
      problems.push({ path: "photos", message: `A ${body.kind} here needs at least ${evidence.min_photos} photo(s)` });
    }
    if (evidence.comment_required && !body.comment?.trim()) problems.push({ path: "comment", message: `A ${body.kind} here needs a comment` });
    return problems;
  }

  /** A move by staff, or with `by` by a partner's person, credited to that partner. */
  function run(body: MoveBody, by?: Mover): Answer<MoveResponse> {
    const moved: StoredPiece[] = [];
    for (const id of body.work_order_ids) {
      const piece = pieces.get(id);
      if (!piece) return { ok: false, status: 404, detail: "Work order not found" };
      moved.push(piece);
    }
    const respond = (): Answer<MoveResponse> => ({ ok: true, body: { data: moved.map(base) } });
    const atStep = STEPS.find((s) => s.key === body.at_step);
    const moveId = crypto.randomUUID();
    if (by) movers.set(moveId, by.partner.id);
    const common = {
      ...(by ? { actor: by.actor, partner: by.partner } : {}),
      move_id: moveId,
      answers: (body.answers ?? []).map((a) => answerOf(atStep, a)),
      comment: body.comment ?? null,
      photo_file_version_ids: body.photo_file_version_ids ?? [],
      photos: (body.photo_file_version_ids ?? []).map((id) => ({ file_id: id, file_version_id: id })),
      created_at: createdAt(),
    };

    if (body.kind === "correction") {
      const target = ref(body.to_step ?? null);
      if (!target) return invalid("to_step", `${body.to_step} is not on the path of the piece at work_order_ids.0`);
      if (!body.comment?.trim()) return invalid("comment", "A correction needs a comment saying why");
      for (const piece of moved) {
        piece.history.push(transition({ ...common, kind: "correction", from_step: ref(piece.stepKey), to_step: target }));
        piece.stepKey = target.key;
        piece.status = "active";
        piece.inRework = false;
      }
      return respond();
    }

    const step = STEPS.find((s) => s.key === body.at_step);
    if (!step || moved.some((piece) => piece.status !== "active" || piece.stepKey !== step.key)) {
      return { ok: false, status: 409, detail: "Some pieces cannot make this move" };
    }

    if (body.kind === "pass" && body.inspected === false) {
      if (!step.sampling) return { ok: false, status: 409, detail: "This step doesn't sample, so every piece is inspected" };
    } else {
      const problems = gate(body, step);
      if (problems.length) return { ok: false, status: 400, errors: problems };
    }

    if (body.kind === "pass") {
      for (const piece of moved) {
        piece.history.push(transition({ ...common, kind: "pass", from_step: ref(step.key), to_step: ref(nextKey(step.key)), inspected: body.inspected ?? true }));
        advance(piece, step.key);
      }
      return respond();
    }

    const defect = step.defects.find((d) => d.defect_id === body.defect_id)!;
    const outcome = body.outcome ?? defect.outcome;
    const reworkTo = outcome === "rework" ? (body.rework_to ?? defect.rework_to) : null;
    const overridden = outcome !== defect.outcome || (outcome === "rework" && reworkTo !== defect.rework_to);
    if (overridden && !body.override_reason) return invalid("override_reason", "required when the outcome or rework target is overridden");

    for (const piece of moved) {
      if (outcome === "rework") {
        piece.stepKey = reworkTo;
        piece.inRework = true;
      } else if (outcome === "scrap") {
        piece.stepKey = null;
        piece.status = "scrapped";
        piece.inRework = false;
      } else {
        advance(piece, step.key);
      }
      piece.history.push(
        transition({
          ...common,
          kind: "fail",
          outcome,
          from_step: ref(step.key),
          to_step: ref(piece.stepKey),
          defect: { id: defect.defect_id, key: defect.key, name: defect.name },
          override_reason: body.override_reason ?? null,
        }),
      );
    }
    return respond();
  }

  const store = {
    group(id: string): Answer<Group> {
      const members = [...pieces.values()].filter((piece) => piece.groupId === id);
      if (members.length === 0) return { ok: false, status: 404, detail: "Group not found" };
      const count = (status: PieceStatus) => members.filter((piece) => piece.status === status).length;
      return {
        ok: true,
        body: {
          id,
          workflow: WORKFLOW,
          source: { type: "order_line", id: uuid("33333333", 1) },
          product_id: null,
          customer_id: null,
          quantity: members.length,
          pieces: { active: count("active"), finished: count("finished"), scrapped: count("scrapped") },
          steps: STEPS.map((s) => {
            const here = members.filter((piece) => piece.status === "active" && piece.stepKey === s.key);
            const { latest, ...checks } = checksAt(s.key, members);
            return {
              key: s.key,
              name: s.name,
              count: here.length,
              in_rework: here.filter((piece) => piece.inRework).length,
              ...checks,
              latest_check: latest ? { actor: latest.actor, partner: latest.partner, created_at: latest.created_at, photos: latest.photos } : null,
            };
          }),
        },
      };
    },

    pieces(params: URLSearchParams): Answer<Page<WorkOrderListItem>> {
      const extra = [...params.keys()].find((key) => !LIST_KEYS.includes(key));
      if (extra) return invalid(extra, `Unrecognized key: "${extra}"`);
      const limit = Number(params.get("limit") ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) return invalid("limit", "must be 1 to 200");
      const offset = Number(params.get("cursor") ?? 0);
      if (!Number.isInteger(offset) || offset < 0) return invalid("cursor", "Invalid cursor");
      const groupId = params.get("group_id");
      const stepKey = params.get("step_key");
      const status = params.get("status");
      const all = [...pieces.values()]
        .filter((piece) => (!groupId || piece.groupId === groupId) && (!stepKey || piece.stepKey === stepKey) && (!status || piece.status === status))
        .sort((a, b) => a.number - b.number);
      const data = all.slice(offset, offset + limit).map(listItem);
      return { ok: true, body: { data, next_cursor: offset + limit < all.length ? String(offset + limit) : null } };
    },

    /** `GET /workflow/groups/{id}/moves`: one item per action, newest first, counts over every page. */
    moves(groupId: string, params: URLSearchParams): Answer<MoveHistory> {
      const extra = [...params.keys()].find((key) => !MOVES_KEYS.includes(key));
      if (extra) return invalid(extra, `Unrecognized key: "${extra}"`);
      const only = params.get("only");
      if (only !== null && only !== "fails") return invalid("only", 'Invalid option: expected "fails"');
      const limit = Number(params.get("limit") ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) return invalid("limit", "must be 1 to 200");
      const offset = Number(params.get("cursor") ?? 0);
      if (!Number.isInteger(offset) || offset < 0) return invalid("cursor", "Invalid cursor");
      const members = [...pieces.values()].filter((piece) => piece.groupId === groupId);
      if (members.length === 0) return { ok: false, status: 404, detail: "Group not found" };

      const byMove = new Map<string, Row[]>();
      for (const piece of members) {
        for (const move of piece.history) byMove.set(move.move_id, [...(byMove.get(move.move_id) ?? []), { piece, move }]);
      }
      const all = [...byMove.values()]
        .map((rows) => ({ action: actionOf(rows), fail: rows.some(isFailRow) }))
        .sort((a, b) => b.action.created_at.localeCompare(a.action.created_at) || b.action.id.localeCompare(a.action.id));
      const kept = only === "fails" ? all.filter((one) => one.fail) : all;
      return {
        ok: true,
        body: {
          data: kept.slice(offset, offset + limit).map((one) => one.action),
          next_cursor: offset + limit < kept.length ? String(offset + limit) : null,
          counts: { all: all.length, fails: all.filter((one) => one.fail).length },
        },
      };
    },

    version(id: string, number: number): Answer<WorkflowVersion> {
      if (id !== WORKFLOW.id || number !== WORKFLOW.version) return { ok: false, status: 404, detail: "Workflow version not found" };
      return { ok: true, body: { workflow_id: id, number, created_at: createdAt(), steps: structuredClone(STEPS), payout_step: "finish" } };
    },

    piece(id: string): Answer<WorkOrderDetail> {
      const piece = pieces.get(id);
      if (!piece) return { ok: false, status: 404, detail: "Work order not found" };
      return {
        ok: true,
        body: {
          ...base(piece),
          to_inspect: null,
          path: STEPS.map(({ key, name }) => ({ key, name })),
          sop: STEPS.find((s) => s.key === piece.stepKey)?.sop_file_version_id ? SOP : null,
          history: structuredClone(piece.history),
        },
      };
    },

    /** This step now needs a skill the caller doesn't hold, so its pieces can't be worked. */
    requireSkill(stepKey: string): void {
      skilled.add(stepKey);
    },

    /** `POST /workflow/moves`, with erp-api's one-time `Idempotency-Key`. */
    move(body: MoveBody, key: string | null): Answer<MoveResponse> {
      const input = JSON.stringify(body);
      const seen = key ? keys.get(key) : undefined;
      if (seen) {
        return seen.input === input ? { ok: true, body: seen.body } : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };
      }
      const answer = run(body);
      if (answer.ok && key) keys.set(key, { input, body: answer.body });
      return answer;
    },

    /**
     * A partner's view of a job's pieces (erp-api `partner-jobs.service.ts` `detail`): its own steps with their
     * rules and what was checked there since `since` (the hand-over), and every piece but cancelled ones with
     * its stage. Null `since` is an offer: nothing counted, no last moves. Null for a group with no pieces.
     */
    partnerView(groupId: string, partnerId: string, since: string | null): Pick<PartnerJobDetail, "steps" | "work_orders"> | null {
      const all = members(groupId);
      if (all.length === 0) return null;
      const counted = since === null ? [] : all.map((piece) => ({ ...piece, history: piece.history.filter((move) => move.created_at >= since) }));
      return {
        steps: PARTNER_STEPS.map((s) => {
          const here = all.filter((piece) => piece.status === "active" && piece.stepKey === s.key);
          const { latest, defects, ...checks } = checksAt(s.key, counted);
          return {
            key: s.key,
            name: s.name,
            sop_file_version_id: s.sop_file_version_id,
            checklist: s.checklist,
            defects: s.defects.map((d) => ({ id: d.defect_id, key: d.key, name: d.name, outcome: d.outcome, rework_to: d.rework_to })),
            rework_targets: s.rework_targets.map((key) => ({ key, name: ref(key)?.name ?? key })),
            pass: s.pass,
            fail: s.fail,
            sampling: s.sampling,
            count: here.length,
            in_rework: here.filter((piece) => piece.inRework).length,
            ...checks,
            defect_counts: defects,
            latest_check: latest
              ? { move_id: latest.move_id, actor: actorFor(latest.move_id, latest.actor.name, partnerId), created_at: latest.created_at, photos: latest.photos }
              : null,
          };
        }),
        work_orders: all
          .sort((a, b) => a.number - b.number)
          .flatMap((piece) => {
            if (piece.status === "cancelled") return [];
            const last = since === null ? undefined : piece.history.at(-1);
            return [
              {
                id: piece.id,
                label: `${piece.number}/${piece.quantity}`,
                status: piece.status,
                step_key: piece.stepKey,
                to_inspect: null,
                in_rework: piece.status === "active" && piece.inRework,
                stage: stageOf(piece),
                last_move: last
                  ? {
                      kind: last.kind,
                      outcome: last.outcome,
                      from_step: last.from_step,
                      defect: last.defect,
                      created_at: last.created_at,
                      actor: actorFor(last.move_id, last.actor.name, partnerId),
                    }
                  : null,
              },
            ];
          }),
      };
    },

    /** `GET .../jobs/{groupId}/work-orders/{workOrderId}`: one piece of the job and every move it has had. */
    partnerPiece(groupId: string, id: string, partnerId: string): Answer<PartnerWorkOrder> {
      const piece = pieces.get(id);
      if (!piece || piece.groupId !== groupId) return { ok: false, status: 404, detail: "Work order not found" };
      const step = ref(piece.stepKey);
      return {
        ok: true,
        body: {
          id: piece.id,
          label: `${piece.number}/${piece.quantity}`,
          status: piece.status,
          step: step ? { key: step.key, name: step.name } : null,
          to_inspect: null,
          in_rework: piece.status === "active" && piece.inRework,
          path: STEPS.map(({ key, name }) => ({ key, name })),
          history: piece.history.map((move) => partnerTransition(move, partnerId)),
        },
      };
    },

    /** `GET .../jobs/{groupId}/moves` (erp-api `job-moves.service.ts`): staff's list, read as the partner reads it. */
    partnerMoves(groupId: string, params: URLSearchParams, partnerId: string, handedOverAt: string): Answer<PartnerMoveHistory> {
      const answer = store.moves(groupId, params);
      if (!answer.ok) return answer;
      return {
        ok: true,
        body: {
          data: answer.body.data.map((action) => {
            const actor = actorFor(action.id, action.actor.name, partnerId);
            const own = actor.kind === "own";
            return {
              id: action.id,
              kind: action.kind,
              outcome: action.outcome,
              from_step: action.from_step,
              to_step: action.to_step,
              defect: action.defect,
              override_reason: own ? action.override_reason : null,
              comment: own ? action.comment : null,
              answers: action.answers.map((one) => ({ ...one, note: own ? one.note : null })),
              photos: action.photos,
              inspected: action.inspected,
              created_at: action.created_at,
              pieces: action.pieces,
              actor,
            };
          }),
          next_cursor: answer.body.next_cursor,
          counts: answer.body.counts,
          handed_over_at: handedOverAt,
        },
      };
    },

    /** A photo of a move on a piece of the group; any other is not found (erp-api `job-moves.service.ts` `photoUrl`). */
    partnerPhoto(groupId: string, moveId: string, fileVersionId: string): Answer<{ url: string; expires_at: string }> {
      const found = members(groupId).some((piece) =>
        piece.history.some((move) => move.move_id === moveId && move.photos.some((photo) => photo.file_version_id === fileVersionId)),
      );
      if (!found) return { ok: false, status: 404, detail: "Photo not found" };
      return { ok: true, body: { url: `https://storage.example.test/${fileVersionId}`, expires_at: new Date(now() + 5 * 60_000).toISOString() } };
    },

    /**
     * `POST /partner-portal/partners/{partnerId}/moves` (erp-api `moves.service.ts:211`, `:268-282`): a piece not on
     * a job the partner holds is not found, and a move at a workspace step is a 409. The move counts for the partner.
     */
    partnerMove(body: MoveBody, key: string | null, by: Mover, holds: (groupId: string) => boolean): Answer<MoveResponse> {
      const input = JSON.stringify({ partner: by.partner.id, body });
      const seen = key ? keys.get(key) : undefined;
      if (seen) {
        return seen.input === input ? { ok: true, body: seen.body } : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };
      }
      const moving = body.work_order_ids.map((id) => pieces.get(id));
      if (moving.some((piece) => !piece || !holds(piece.groupId))) return { ok: false, status: 404, detail: "Work order not found" };
      const partnerStep = (stepKey: string | null | undefined) => STEPS.find((s) => s.key === stepKey)?.done_by === "partner";
      const touched = body.kind === "correction" ? moving.flatMap((piece) => [piece!.stepKey, body.to_step]) : [body.at_step];
      if (touched.some((stepKey) => !partnerStep(stepKey))) return { ok: false, status: 409, detail: "Some pieces would move at the workspace's own steps" };
      const answer = run(body, by);
      if (answer.ok && key) keys.set(key, { input, body: answer.body });
      return answer;
    },
  };
  return store;
}

export type ProductionStore = ReturnType<typeof createProductionStore>;
