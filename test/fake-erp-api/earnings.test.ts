import { describe, expect, it } from "vitest";

import { createEarningsStore } from "./earnings";
import type { Answer } from "./orders";
import { FAKE_API_URL, FAKE_PASSWORD, LAYERLINE_ID, NORTHCAST_ADMIN, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER, WORKSPACE, type FakeUser } from "./seed";
import { fakeState } from "./state";

const NOW = Date.parse("2026-11-15T10:00:00Z");

function ok<T>(answer: Answer<T>): T {
  if (!answer.ok) throw new Error(`expected a body, got ${answer.status}`);
  return answer.body;
}

async function tokenFor(user: FakeUser): Promise<string> {
  const login = await fetch(`${FAKE_API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: WORKSPACE, email: user.email, password: FAKE_PASSWORD }),
  });
  return ((await login.json()) as { access_token: string }).access_token;
}

async function call(user: FakeUser, path: string, method = "GET") {
  const token = await tokenFor(user);
  return fetch(`${FAKE_API_URL}/partner-portal/partners/${NORTHCAST_ID}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
}

describe("fake erp-api partner earnings", () => {
  it("pages a partner's owed jobs", () => {
    const store = createEarningsStore(() => NOW);
    const first = ok(store.owed(NORTHCAST_ID, new URLSearchParams({ limit: "20" })));
    expect(first.jobs).toHaveLength(20);
    expect(first.next_cursor).not.toBeNull();
    const second = ok(store.owed(NORTHCAST_ID, new URLSearchParams({ limit: "20", cursor: first.next_cursor! })));
    expect(second.jobs).toHaveLength(5);
    expect(second.next_cursor).toBeNull();
    const totals = { due_total: "1240.00", not_yet_total: "380.00", not_yet_count: 3, currency: "EUR" };
    expect(first).toMatchObject(totals);
    expect(second).toMatchObject(totals);
  });

  it("seeds the cases the page words", () => {
    const store = createEarningsStore(() => NOW);
    const first = ok(store.owed(NORTHCAST_ID, new URLSearchParams({ limit: "20" })));
    const jobs = [...first.jobs, ...ok(store.owed(NORTHCAST_ID, new URLSearchParams({ limit: "20", cursor: first.next_cursor! }))).jobs];
    expect(jobs.some((job) => job.holding === "taken_back" && job.amount === "0.00")).toBe(true);
    expect(jobs.some((job) => job.state === "not_yet" && job.due.startsWith("-"))).toBe(true);
    const payouts = ok(store.payouts(NORTHCAST_ID, new URLSearchParams())).data;
    expect(payouts.map((payout) => payout.status)).toEqual(["pending", "paid", "failed"]);
    expect(payouts[0]!.jobs.some((job) => job.amount.startsWith("-"))).toBe(true);
    expect(store.account(NORTHCAST_ID)).toEqual({ state: "not_connected" });
  });

  it("has nothing for Layerline", () => {
    const store = createEarningsStore(() => NOW);
    expect(ok(store.owed(LAYERLINE_ID, new URLSearchParams()))).toMatchObject({ due_total: "0.00", not_yet_count: 0, jobs: [] });
    expect(ok(store.payouts(LAYERLINE_ID, new URLSearchParams())).data).toEqual([]);
    expect(store.account(LAYERLINE_ID)).toEqual({ state: "ready" });
  });

  it("gives a failed payout's money back", () => {
    const store = createEarningsStore(() => NOW);
    store.settlePending(NORTHCAST_ID, "failed");
    expect(ok(store.payouts(NORTHCAST_ID, new URLSearchParams())).data[0]!.status).toBe("failed");
    expect(ok(store.owed(NORTHCAST_ID, new URLSearchParams())).due_total).toBe("1660.00");
  });

  it("settles a paid payout without changing what's owed", () => {
    const store = createEarningsStore(() => NOW);
    store.settlePending(NORTHCAST_ID, "paid");
    const [payout] = ok(store.payouts(NORTHCAST_ID, new URLSearchParams())).data;
    expect(payout).toMatchObject({ status: "paid", settled_at: new Date(NOW).toISOString() });
    expect(ok(store.owed(NORTHCAST_ID, new URLSearchParams())).due_total).toBe("1240.00");
  });

  it("turns a member away", async () => {
    for (const path of ["/owed", "/payouts", "/payout-account"]) {
      expect((await call(NORTHCAST_MEMBER, path)).status).toBe(403);
      expect((await call(NORTHCAST_ADMIN, path)).status).toBe(200);
    }
  });

  it("gives the link to the owner only", async () => {
    expect((await call(NORTHCAST_ADMIN, "/payout-account/link", "POST")).status).toBe(403);
    const res = await call(PARTNER, "/payout-account/link", "POST");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: `${FAKE_API_URL}/fake-provider/onboarding?partner=${NORTHCAST_ID}` });

    fakeState().earnings.linkUnavailable(NORTHCAST_ID);
    expect((await call(PARTNER, "/payout-account/link", "POST")).status).toBe(409);

    fakeState().suspendPartner(NORTHCAST_ID);
    expect((await call(PARTNER, "/payout-account/link", "POST")).status).toBe(403);
  });

  it("answers each person's role at the workshop", async () => {
    const token = await tokenFor(NORTHCAST_MEMBER);
    const res = await fetch(`${FAKE_API_URL}/partner-portal/me`, { headers: { authorization: `Bearer ${token}` } });
    expect(await res.json()).toMatchObject({ partners: [{ id: NORTHCAST_ID, role: "member" }] });
  });
});
