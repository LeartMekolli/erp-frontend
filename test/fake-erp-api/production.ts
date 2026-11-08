/**
 * The fake erp-api's production: one four-step workflow and the pieces of two
 * order lines, spread across its steps. It keeps the rules the order page
 * depends on (erp-api `src/modules/workflow/`): every piece of a move at
 * `at_step` or nothing moves (`moves.service.ts:249`), the QC gate listing each
 * problem (`qc-gate.ts`), and a reason for overriding a defect's outcome.
 */

import type {
  Group,
  MoveBody,
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
  return {
    id: crypto.randomUUID(),
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
            created_at: at(1),
          });
          add({ status: "active", stepKey: s.key, inRework: true, history: [...passesBefore(index + 1, at), failed] });
        } else {
          add({ status: "active", stepKey: s.key, history: passesBefore(index, at) });
        }
      }
    });
    for (let n = 0; n < (group.finished ?? 0); n += 1) add({ status: "finished", stepKey: null, history: passesBefore(STEPS.length, at) });
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
      add({ status: "scrapped", stepKey: null, history: [...passesBefore(1, at), scrapped] });
    }
    return pieces;
  });
}

const invalid = (path: string, message: string): Answer<never> => ({ ok: false, status: 400, errors: [{ path, message }] });

const LIST_KEYS = ["limit", "cursor", "group_id", "step_key", "status", "workable"];

export function createProductionStore(now: () => number) {
  const pieces = new Map(seedPieces(now()).map((piece) => [piece.id, piece]));
  const keys = new Map<string, { input: string; body: MoveResponse }>();
  const createdAt = () => new Date(now()).toISOString();

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

  const listItem = (piece: StoredPiece): WorkOrderListItem => ({ ...base(piece), to_inspect: null, may_work: piece.status === "active" });

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

  function run(body: MoveBody): Answer<MoveResponse> {
    const moved: StoredPiece[] = [];
    for (const id of body.work_order_ids) {
      const piece = pieces.get(id);
      if (!piece) return { ok: false, status: 404, detail: "Work order not found" };
      moved.push(piece);
    }
    const respond = (): Answer<MoveResponse> => ({ ok: true, body: { data: moved.map(base) } });
    const common = {
      answers: (body.answers ?? []).map((a) => ({ item: a.item, value: String(a.value), note: a.note ?? null, passing: true })),
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

  return {
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
            return { key: s.key, name: s.name, count: here.length, in_rework: here.filter((piece) => piece.inRework).length };
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
          sop_file_version_id: null,
          history: structuredClone(piece.history),
        },
      };
    },

    /** `POST /workflow/moves`, with erp-api's one-time `Idempotency-Key`. */
    move(body: MoveBody, key: string | null): Answer<MoveResponse> {
      const input = JSON.stringify(body);
      const seen = key ? keys.get(key) : undefined;
      if (seen) {
        return seen.input === input ? { ok: true, body: seen.body } : { ok: false, status: 409, detail: "Idempotency key reused with a different request" };
      }
      const answer = run(body);
      if (answer.ok && key) keys.set(key, { input, body: answer.body });
      return answer;
    },
  };
}

export type ProductionStore = ReturnType<typeof createProductionStore>;
