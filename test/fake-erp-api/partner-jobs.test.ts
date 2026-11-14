import { describe, expect, it } from "vitest";

import type { Answer } from "./orders";
import { groupIdOf } from "./orders-seed";
import {
  createPartnerJobsStore,
  EARRING_JOB_ID,
  FACADE_OFFER_ID,
  LONG_NAME_JOB_ID,
  LONG_PRODUCT_NAME,
  PENDANT_OFFER_ID,
  RING_BAND_JOB_ID,
  RING_OFFER_ID,
} from "./partner-jobs";
import { createProductionStore } from "./production";
import { FAKE_API_URL, FAKE_PASSWORD, LAYERLINE_ID, LAYERLINE_OWNER, NORTHCAST_ID, PARTNER, STAFF, WORKSPACE } from "./seed";
import { fakeState } from "./state";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const MINUTE_MS = 60_000;
const NORA = { id: PARTNER.id, name: PARTNER.name };

/** A store on a clock the test can move, over its own production. */
function store() {
  const clock = { now: NOW };
  const production = createProductionStore(() => clock.now);
  return { clock, production, jobs: createPartnerJobsStore(() => clock.now, production) };
}

function ok<T>(answer: Answer<T>): T {
  if (!answer.ok) throw new Error(`expected a body, got ${answer.status}`);
  return answer.body;
}

function params(query: Record<string, string>) {
  return new URLSearchParams(query);
}

type Store = ReturnType<typeof store>["jobs"];

const ids = (jobs: Store, partnerId: string, query: Record<string, string> = {}) =>
  ok(jobs.list(partnerId, params(query))).data.map((job) => job.id);

describe("fake erp-api partner jobs", () => {
  it("lists offered and accepted jobs, newest first", () => {
    const { jobs } = store();
    const list = ok(jobs.list(NORTHCAST_ID, params({}))).data;
    expect(list.map((job) => job.id)).toEqual([RING_OFFER_ID, PENDANT_OFFER_ID, LONG_NAME_JOB_ID, RING_BAND_JOB_ID]);
    const offeredAt = list.map((job) => job.offered_at);
    expect(offeredAt).toEqual([...offeredAt].sort().reverse());
    expect(list.map((job) => job.id)).not.toContain(EARRING_JOB_ID);
  });

  it("seeds the jobs as the plan describes them", () => {
    const { jobs } = store();
    const ring = ok(jobs.detail(NORTHCAST_ID, RING_OFFER_ID));
    expect(ring).toMatchObject({
      status: "offered",
      product: { name: "Ring" },
      options: [{ group: "Material", value: "Silver 925" }],
      quantity: 10,
      cost: "240.00",
      pieces: { active: 10, finished: 0, scrapped: 0 },
      expires_at: new Date(NOW + 5 * 3_600_000 + 12 * MINUTE_MS).toISOString(),
      due_on: "2026-11-20",
      steps: [{ key: "casting", name: "Casting", sop_file_version_id: null }],
      work_orders: [],
      summary: null,
    });
    const band = ok(jobs.detail(NORTHCAST_ID, RING_BAND_JOB_ID));
    expect(band).toMatchObject({ status: "accepted", due_on: "2026-11-12", pieces: { active: 10, finished: 1, scrapped: 1 }, expires_at: null });
    const long = ok(jobs.detail(NORTHCAST_ID, LONG_NAME_JOB_ID));
    expect(LONG_PRODUCT_NAME).toHaveLength(60);
    expect(long.product?.name).toBe(LONG_PRODUCT_NAME);
    expect(long.options).toHaveLength(3);
    expect(ok(jobs.detail(LAYERLINE_ID, FACADE_OFFER_ID)).steps[0]?.key).toBe("print");
  });

  it("filters by status before paging", () => {
    const { jobs } = store();
    expect(ids(jobs, NORTHCAST_ID, { status: "finished" })).toEqual([EARRING_JOB_ID]);
    expect(ids(jobs, NORTHCAST_ID, { status: "accepted" })).toEqual([LONG_NAME_JOB_ID, RING_BAND_JOB_ID]);

    const first = ok(jobs.list(NORTHCAST_ID, params({ status: "offered", limit: "1" })));
    expect(first.data.map((job) => job.id)).toEqual([RING_OFFER_ID]);
    expect(first.next_cursor).not.toBeNull();
    const second = ok(jobs.list(NORTHCAST_ID, params({ status: "offered", limit: "1", cursor: first.next_cursor! })));
    expect(second.data.map((job) => job.id)).toEqual([PENDANT_OFFER_ID]);
    expect(second.next_cursor).toBeNull();
  });

  it("lets an offer go at its deadline", () => {
    const { clock, jobs } = store();
    const { expires_at } = ok(jobs.detail(NORTHCAST_ID, PENDANT_OFFER_ID));
    clock.now = Date.parse(expires_at!) + 1;
    expect(ids(jobs, NORTHCAST_ID)).not.toContain(PENDANT_OFFER_ID);
    expect(ids(jobs, NORTHCAST_ID, { status: "offered" })).not.toContain(PENDANT_OFFER_ID);
    expect(jobs.detail(NORTHCAST_ID, PENDANT_OFFER_ID)).toMatchObject({ ok: false, status: 404 });
    expect(jobs.answer(NORTHCAST_ID, PENDANT_OFFER_ID, "accept", null)).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a bad query", () => {
    const { jobs } = store();
    expect(jobs.list(NORTHCAST_ID, params({ status: "done" }))).toEqual({
      ok: false,
      status: 400,
      errors: [{ path: "status", message: expect.any(String) }],
    });
    expect(jobs.list(NORTHCAST_ID, params({ limit: "0" }))).toEqual({
      ok: false,
      status: 400,
      errors: [{ path: "limit", message: expect.any(String) }],
    });
  });

  it("keeps each workshop to its own jobs", () => {
    const { jobs } = store();
    expect(ids(jobs, LAYERLINE_ID)).toEqual([FACADE_OFFER_ID]);
    expect(jobs.detail(LAYERLINE_ID, RING_OFFER_ID)).toMatchObject({ ok: false, status: 404 });
    expect(jobs.answer(LAYERLINE_ID, RING_OFFER_ID, "accept", null)).toMatchObject({ ok: false, status: 404 });
  });

  it("accepts an offer once", () => {
    const { jobs } = store();
    const first = ok(jobs.answer(NORTHCAST_ID, RING_OFFER_ID, "accept", "k"));
    expect(first).toMatchObject({ group_id: RING_OFFER_ID, kind: "offer", status: "accepted", partner: { id: NORTHCAST_ID, name: "Northcast Foundry" } });
    expect(ids(jobs, NORTHCAST_ID, { status: "accepted" })).toContain(RING_OFFER_ID);
    expect(ids(jobs, NORTHCAST_ID, { status: "offered" })).not.toContain(RING_OFFER_ID);

    expect(ok(jobs.answer(NORTHCAST_ID, RING_OFFER_ID, "accept", "k"))).toEqual(first);
    expect(jobs.answer(NORTHCAST_ID, RING_OFFER_ID, "accept", null)).toMatchObject({ ok: false, status: 409 });
  });

  it("declines an offer", () => {
    const { jobs } = store();
    expect(ok(jobs.answer(NORTHCAST_ID, RING_OFFER_ID, "decline", null))).toMatchObject({ status: "declined" });
    expect(ids(jobs, NORTHCAST_ID)).not.toContain(RING_OFFER_ID);
    for (const status of ["offered", "accepted", "finished"]) expect(ids(jobs, NORTHCAST_ID, { status })).not.toContain(RING_OFFER_ID);
    expect(jobs.detail(NORTHCAST_ID, RING_OFFER_ID)).toMatchObject({ ok: false, status: 404 });
  });

  it("answers 404 for a job never offered", () => {
    const { jobs } = store();
    expect(jobs.answer(NORTHCAST_ID, EARRING_JOB_ID, "accept", null)).toMatchObject({ ok: false, status: 409 });
    expect(jobs.answer(NORTHCAST_ID, crypto.randomUUID(), "accept", null)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("fake erp-api partner job pieces", () => {
  const band = (jobs: Store) => ok(jobs.detail(NORTHCAST_ID, RING_BAND_JOB_ID));
  const at = (jobs: Store, stepKey: string) => band(jobs).work_orders.filter((piece) => piece.step_key === stepKey);
  const passAtFinish = (id: string, comment?: string) => ({
    kind: "pass" as const,
    work_order_ids: [id],
    at_step: "finish",
    answers: [{ item: "surface_smooth", value: true }],
    photo_file_version_ids: ["f1f1f1f1-0000-4000-8000-000000000001"],
    ...(comment ? { comment } : {}),
  });

  it("fills in Ring band from the pieces", () => {
    const { jobs } = store();
    const job = band(jobs);
    expect(job.steps.map((step) => step.key)).toEqual(["finish"]);
    expect(job.steps[0]).toMatchObject({
      checklist: [{ key: "surface_smooth", kind: "yes_no" }],
      defects: [{ id: "b3b3b3b3-0000-4000-8000-000000000001", key: "scratch" }],
      rework_targets: [{ key: "finish", name: "Finish" }],
      pass: { min_photos: 1 },
    });
    const stages = (stepKey: string) => [...new Set(at(jobs, stepKey).map((piece) => piece.stage))];
    expect(stages("print")).toEqual(["not_yet"]);
    expect(stages("finish")).toEqual(["yours"]);
    expect(stages("final_qc")).toEqual(["done"]);
    expect(stages("packing")).toEqual(["done"]);
    expect(job.work_orders.filter((piece) => piece.status !== "active").map((piece) => piece.stage)).toEqual([null, null]);
    expect(job.steps[0]!.count).toBe(4);
  });

  it("moves only at the partner's step", () => {
    const { jobs, production } = store();
    const piece = at(jobs, "finish")[1]!;
    expect(ok(jobs.move(NORTHCAST_ID, passAtFinish(piece.id), null, NORA)).data[0]?.step?.key).toBe("final_qc");
    expect(band(jobs).work_orders.find((one) => one.id === piece.id)?.step_key).toBe("final_qc");

    const qc = at(jobs, "final_qc")[0]!;
    expect(jobs.move(NORTHCAST_ID, { kind: "pass", work_order_ids: [qc.id], at_step: "final_qc" }, null, NORA)).toMatchObject({ ok: false, status: 409 });

    const elsewhere = ok(production.pieces(new URLSearchParams({ group_id: groupIdOf(1041, 0), status: "active" }))).data[0]!;
    expect(jobs.move(NORTHCAST_ID, { kind: "pass", work_order_ids: [elsewhere.id], at_step: elsewhere.step!.key }, null, NORA)).toMatchObject({ ok: false, status: 404 });
  });

  it("names only the partner's own people", () => {
    const { jobs } = store();
    jobs.move(NORTHCAST_ID, passAtFinish(at(jobs, "finish")[1]!.id, "Smooth now"), null, NORA);
    const { data } = ok(jobs.moves(NORTHCAST_ID, RING_BAND_JOB_ID, new URLSearchParams()));
    const own = data.find((action) => action.actor.kind === "own");
    expect(own).toMatchObject({ actor: { kind: "own", name: "Nora" }, comment: "Smooth now" });
    const staffFail = data.find((action) => action.kind === "fail" && action.outcome === "rework");
    expect(staffFail).toMatchObject({ actor: { kind: "workspace", name: null }, comment: null });
    expect(data.every((action) => !("partner" in action))).toBe(true);

    const latest = band(jobs).steps[0]!.latest_check;
    expect(latest).toMatchObject({ actor: { kind: "own", name: "Nora" }, move_id: own!.id });
  });

  it("keeps the job's routes from an offer", () => {
    const { jobs } = store();
    expect(jobs.holds(NORTHCAST_ID, RING_OFFER_ID)).toBe(false);
    expect(jobs.design(NORTHCAST_ID, RING_OFFER_ID)).toMatchObject({ ok: false, status: 404 });
    expect(jobs.moves(NORTHCAST_ID, RING_OFFER_ID, new URLSearchParams())).toMatchObject({ ok: false, status: 404 });
    expect(jobs.piece(NORTHCAST_ID, RING_OFFER_ID, at(jobs, "finish")[0]!.id)).toMatchObject({ ok: false, status: 404 });
    expect(jobs.holds(NORTHCAST_ID, RING_BAND_JOB_ID)).toBe(true);
    expect(jobs.design(NORTHCAST_ID, RING_BAND_JOB_ID)).toMatchObject({ ok: true });
  });
});

describe("fake erp-api partner jobs over HTTP", () => {
  async function tokenFor(email: string): Promise<string> {
    const login = await fetch(`${FAKE_API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: WORKSPACE, email, password: FAKE_PASSWORD }),
    });
    return ((await login.json()) as { access_token: string }).access_token;
  }

  const jobsUrl = (partnerId: string, tail = "") => `${FAKE_API_URL}/partner-portal/partners/${partnerId}/jobs${tail}`;

  it("refuses an answer while suspended", async () => {
    const token = await tokenFor(PARTNER.email);
    const headers = { authorization: `Bearer ${token}` };
    fakeState().suspendPartner(NORTHCAST_ID);

    const answer = await fetch(jobsUrl(NORTHCAST_ID, `/${RING_OFFER_ID}/accept`), { method: "POST", headers });
    expect(answer.status).toBe(403);
    expect(await answer.json()).toMatchObject({ detail: "The partner is suspended" });
    const decline = await fetch(jobsUrl(NORTHCAST_ID, `/${RING_OFFER_ID}/decline`), { method: "POST", headers });
    expect(decline.status).toBe(403);

    const list = await fetch(jobsUrl(NORTHCAST_ID), { headers });
    expect(list.status).toBe(200);
    const me = await fetch(`${FAKE_API_URL}/partner-portal/me`, { headers });
    expect(await me.json()).toMatchObject({ partners: [{ id: NORTHCAST_ID, status: "suspended" }] });
  });

  it("answers 404 to someone who doesn't act for the workshop, and 401 to no one", async () => {
    const token = await tokenFor(LAYERLINE_OWNER.email);
    const other = await fetch(jobsUrl(NORTHCAST_ID), { headers: { authorization: `Bearer ${token}` } });
    expect(other.status).toBe(404);
    expect((await fetch(jobsUrl(NORTHCAST_ID))).status).toBe(401);
  });

  it("accepts an offer through the route", async () => {
    const token = await tokenFor(PARTNER.email);
    const headers = { authorization: `Bearer ${token}`, "idempotency-key": "route-key" };
    const res = await fetch(jobsUrl(NORTHCAST_ID, `/${RING_OFFER_ID}/accept`), { method: "POST", headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "accepted", group_id: RING_OFFER_ID });
    const detail = await fetch(jobsUrl(NORTHCAST_ID, `/${RING_OFFER_ID}`), { headers });
    expect(await detail.json()).toMatchObject({ status: "accepted" });
  });

  it("gives Northcast's owner the two job offers as unread notices", async () => {
    const token = await tokenFor(PARTNER.email);
    const res = await fetch(`${FAKE_API_URL}/notifications`, { headers: { authorization: `Bearer ${token}` } });
    const { data } = (await res.json()) as { data: { title: string; body: string; read_at: string | null; subject: { type: string } }[] };
    expect(data.map((entry) => entry.title)).toEqual(["New job offered: Ring", "New job offered: Pendant"]);
    expect(data.map((entry) => entry.body)).toEqual(["10 pieces, answer within 5 hours.", "3 pieces, answer within 90 minutes."]);
    expect(data.every((entry) => entry.read_at === null && entry.subject.type === "job_assignment")).toBe(true);
  });

  it("says which job a hand-over notice is for", async () => {
    const token = await tokenFor(PARTNER.email);
    const res = await fetch(`${FAKE_API_URL}/notifications`, { headers: { authorization: `Bearer ${token}` } });
    const { data } = (await res.json()) as { data: { job: { id: string; partner_id: string } | null }[] };
    expect(data.map((entry) => entry.job)).toEqual([
      { id: RING_OFFER_ID, partner_id: NORTHCAST_ID },
      { id: PENDANT_OFFER_ID, partner_id: NORTHCAST_ID },
    ]);
  });

  it("posts a partner comment staff can read", async () => {
    const partner = { authorization: `Bearer ${await tokenFor(PARTNER.email)}`, "content-type": "application/json" };
    const posted = await fetch(jobsUrl(NORTHCAST_ID, `/${RING_BAND_JOB_ID}/comments`), { method: "POST", headers: partner, body: JSON.stringify({ body: "Polished, packing tomorrow." }) });
    expect(posted.status).toBe(201);
    expect(await posted.json()).toMatchObject({ author: { kind: "partner", name: "Nora" }, body: "Polished, packing tomorrow." });

    const thread = (await (await fetch(jobsUrl(NORTHCAST_ID, `/${RING_BAND_JOB_ID}/comments`), { headers: partner })).json()) as { data: { body: string; author: unknown }[] };
    expect(thread.data.map((comment) => comment.author)).toEqual([{ kind: "workspace", name: null }, { kind: "partner", name: "Nora" }]);

    const order = fakeState().orders.all().find((one) => one.number === 1048)!;
    const staff = { authorization: `Bearer ${await tokenFor(STAFF.email)}` };
    const staffThread = (await (await fetch(`${FAKE_API_URL}/orders/${order.id}/comments`, { headers: staff })).json()) as { data: { body: string; author: { kind: string }; partner: unknown }[] };
    expect(staffThread.data.find((comment) => comment.body === "Polished, packing tomorrow.")).toMatchObject({
      author: { kind: "partner" },
      partner: { id: NORTHCAST_ID, name: "Northcast Foundry" },
    });
  });

  it("moves but can't comment while suspended", async () => {
    const headers = { authorization: `Bearer ${await tokenFor(PARTNER.email)}`, "content-type": "application/json" };
    fakeState().suspendPartner(NORTHCAST_ID);
    const detail = (await (await fetch(jobsUrl(NORTHCAST_ID, `/${RING_BAND_JOB_ID}`), { headers })).json()) as { work_orders: { id: string; step_key: string | null }[] };
    const piece = detail.work_orders.filter((one) => one.step_key === "finish")[1]!;
    const move = await fetch(`${FAKE_API_URL}/partner-portal/partners/${NORTHCAST_ID}/moves`, {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "pass", work_order_ids: [piece.id], at_step: "finish", answers: [{ item: "surface_smooth", value: true }], photo_file_version_ids: ["f1f1f1f1-0000-4000-8000-000000000001"] }),
    });
    expect(move.status).toBe(200);
    const comment = await fetch(jobsUrl(NORTHCAST_ID, `/${RING_BAND_JOB_ID}/comments`), { method: "POST", headers, body: JSON.stringify({ body: "Done" }) });
    expect(comment.status).toBe(403);
  });

  it("answers 404 for an offer's comments", async () => {
    const headers = { authorization: `Bearer ${await tokenFor(PARTNER.email)}` };
    expect((await fetch(jobsUrl(NORTHCAST_ID, `/${RING_OFFER_ID}/comments`), { headers })).status).toBe(404);
  });
});
