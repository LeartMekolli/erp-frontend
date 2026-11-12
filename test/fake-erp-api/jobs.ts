/**
 * The fake erp-api's hand-over of jobs to partners. It keeps the rules the
 * order page depends on (erp-api `src/modules/partners/jobs.service.ts`): one
 * open offer or assignment per job, an offer past its deadline let go on the
 * spot, an order's lines with one partner, and nothing while payment waits.
 */

import type { EligiblePartners, JobAssignment, LinePartner, paths } from "../../src/lib/api/schema-types";

import type { Answer, OrdersStore } from "./orders";
import { uuid } from "./orders-seed";
import { LAYERLINE_ID, NORTHCAST_ID } from "./seed";

type OfferBody = paths["/partners/jobs/{groupId}/offer"]["post"]["requestBody"]["content"]["application/json"];
type ReassignBody = paths["/partners/jobs/{groupId}/reassign"]["post"]["requestBody"]["content"]["application/json"];

const score = (overall: number | null, finished_jobs: number) => ({
  overall,
  parts: { quality: 0.9, scrap: 0.95, reliability: 0.9, on_time: 0.85, rating: 0.9, claims: 1 },
  finished_jobs,
});

const NORTHCAST = { id: NORTHCAST_ID, name: "Northcast Foundry" };
const LAYERLINE = { id: LAYERLINE_ID, name: "Layerline Prints" };

const ELIGIBLE: EligiblePartners["data"] = [
  { partner: NORTHCAST, cost: "120.00", margin: "80.00", room: [{ step_key: "finish", left: 40 }], score: score(4.6, 18) },
  { partner: LAYERLINE, cost: "135.50", margin: "64.50", room: [{ step_key: "finish", left: 6 }, { step_key: "final_qc", left: 3 }], score: score(null, 2) },
];

const INELIGIBLE: EligiblePartners["ineligible"] = [
  { partner: { id: uuid("b4b4b4b4", 1), name: "Ember Casting" }, reasons: ["Doesn't make this material.", "No room this week."] },
];

/** How long an offer stays open: the seed workspace's deadline. */
const OFFER_MS = 24 * 3_600_000;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

const ONE_PARTNER = "Every line of this order goes to one partner";
const WAITING_FOR_PAYMENT = "The order is waiting for payment";

export function createJobsStore(now: () => number, orders: OrdersStore) {
  const keys = new Map<string, { input: string; body: JobAssignment }>();
  const stamp = (ms = now()) => new Date(ms).toISOString();
  const refuse = (detail: string, code?: string): Answer<never> => ({ ok: false, status: 409, detail, ...(code ? { code } : {}) });
  const notFound: Answer<never> = { ok: false, status: 404, detail: "Group not found" };
  const live = (partner: LinePartner) => partner.status === "accepted" || !partner.expires_at || Date.parse(partner.expires_at) > now();
  const eligibleOne = (id: string) => ELIGIBLE.find((row) => row.partner.id === id);

  function once(key: string | null, input: unknown, run: () => Answer<JobAssignment>): Answer<JobAssignment> {
    const serialised = JSON.stringify(input);
    const seen = key ? keys.get(key) : undefined;
    if (seen) return seen.input === serialised ? { ok: true, body: seen.body } : refuse("Idempotency key reused with a different request", "idempotency_key_reused");
    const answer = run();
    if (answer.ok && key) keys.set(key, { input: serialised, body: answer.body });
    return answer;
  }

  function assignment(groupId: string, partner: { id: string; name: string }, fields: Pick<JobAssignment, "kind" | "status" | "cost" | "expires_at" | "due_on">): JobAssignment {
    return { id: crypto.randomUUID(), group_id: groupId, partner, owed_override: null, responded_at: null, created_at: stamp(), ...fields };
  }

  type Found = NonNullable<ReturnType<OrdersStore["lineOfGroup"]>>;
  const heldElsewhere = (found: Found, partnerId: string) =>
    found.order.lines.some((line) => line.id !== found.line.id && line.partner && live(line.partner) && line.partner.id !== partnerId);

  return {
    eligible(groupId: string): Answer<EligiblePartners> {
      if (!orders.lineOfGroup(groupId)) return notFound;
      return { ok: true, body: { data: ELIGIBLE, ineligible: INELIGIBLE } };
    },

    offer(groupId: string, body: OfferBody, key: string | null): Answer<JobAssignment> {
      if (body.due_on !== undefined && body.due_on < stamp().slice(0, 10)) return { ok: false, status: 400, errors: [{ path: "due_on", message: "must be today or later" }] };
      return once(key, { groupId, body }, () => {
        const found = orders.lineOfGroup(groupId);
        if (!found) return notFound;
        if (found.order.state === "awaiting_payment") return refuse(WAITING_FOR_PAYMENT);
        if (found.line.partner && live(found.line.partner)) return refuse("The job is already offered to or accepted by a partner");
        if (heldElsewhere(found, body.partner_id)) return refuse(ONE_PARTNER);
        const able = eligibleOne(body.partner_id);
        if (!able) return refuse("This partner can't take the job");
        const expires = stamp(now() + OFFER_MS);
        found.line.partner = { ...able.partner, status: "offered", expires_at: expires };
        return { ok: true, body: assignment(groupId, able.partner, { kind: "offer", status: "offered", cost: able.cost, expires_at: expires, due_on: body.due_on ?? null }) };
      });
    },

    withdraw(groupId: string, key: string | null): Answer<JobAssignment> {
      return once(key, { groupId, withdraw: true }, () => {
        const found = orders.lineOfGroup(groupId);
        if (!found) return notFound;
        const current = found.line.partner;
        if (current?.status !== "offered") return refuse("The job has no open offer");
        found.line.partner = null;
        return { ok: true, body: assignment(groupId, { id: current.id, name: current.name }, { kind: "offer", status: "withdrawn", cost: "0.00", expires_at: current.expires_at, due_on: null }) };
      });
    },

    reassign(groupId: string, body: ReassignBody, key: string | null): Answer<JobAssignment> {
      if (body.previous_owed && !MONEY.test(body.previous_owed.amount)) return { ok: false, status: 400, errors: [{ path: "previous_owed.amount", message: "must be an amount with at most 2 places, such as 40.00" }] };
      return once(key, { groupId, body }, () => {
        const found = orders.lineOfGroup(groupId);
        if (!found) return notFound;
        if (found.order.state === "awaiting_payment") return refuse(WAITING_FOR_PAYMENT);
        const current = found.line.partner;
        if (current?.status !== "accepted") return refuse("Only a job a partner has accepted can be moved");
        if (current.id === body.partner_id) return refuse("The job is already with this partner");
        if (heldElsewhere(found, body.partner_id)) return refuse(ONE_PARTNER);
        const able = eligibleOne(body.partner_id);
        if (!able) return refuse("This partner can't take the job");
        found.line.partner = { ...able.partner, status: "accepted", expires_at: null };
        return { ok: true, body: assignment(groupId, able.partner, { kind: "reassign", status: "accepted", cost: able.cost, expires_at: null, due_on: null }) };
      });
    },
  };
}
