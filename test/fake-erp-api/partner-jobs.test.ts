import { describe, expect, it } from "vitest";

import type { Answer } from "./orders";
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
import { FAKE_API_URL, FAKE_PASSWORD, LAYERLINE_ID, LAYERLINE_OWNER, NORTHCAST_ID, PARTNER, WORKSPACE } from "./seed";
import { fakeState } from "./state";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const MINUTE_MS = 60_000;

/** A store on a clock the test can move. */
function store() {
  const clock = { now: NOW };
  return { clock, jobs: createPartnerJobsStore(() => clock.now) };
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
    expect(band).toMatchObject({ status: "accepted", due_on: "2026-11-12", pieces: { active: 9, finished: 2, scrapped: 1 }, expires_at: null });
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
});
