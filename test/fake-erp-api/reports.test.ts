import { describe, expect, it } from "vitest";

import type { DashboardRange, DashboardResponse } from "../../src/lib/api/schema-types";

import { createReportsStore } from "./reports";
import { CLERK, FAKE_API_URL, FAKE_PASSWORD, PRODUCTION_LEAD, SALES_LEAD, STAFF, WORKSPACE, type FakeUser } from "./seed";
import { fakeState } from "./state";

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
  return fetch(`${FAKE_API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
}

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

async function range(user: FakeUser, query: string): Promise<DashboardRange> {
  const response = await call(user, `/reports/range?${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as DashboardRange;
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** The dates in (from, to]: after `from`, up to and including `to`. */
function datesAfter(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = addDays(from, 1); date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** The last `days` days, ending 30 days ago so that a test never runs into today's date moving on. */
function lastDays(days: number): string {
  const to = addDays(today(), -30);
  return `from=${addDays(to, -(days - 1))}&to=${to}`;
}

describe("fake erp-api /reports/range", () => {
  it("gives staff with every permission everything", async () => {
    const body = await range(STAFF, lastDays(30));
    expect(body.current.orders.revenue).toMatch(/^\d+\.\d{2}$/);
    expect(body.current.orders.by_product?.length).toBeGreaterThan(0);
    expect(body.current.orders.by_customer_group?.length).toBeGreaterThan(0);
    expect(body.current.customers.top[0]?.revenue).toMatch(/^\d+\.\d{2}$/);
    expect(body.current.customers.slow_payers).toBeDefined();
    expect(body.current.production.defects_by_kind.length).toBeGreaterThan(0);
    expect(body.current.partners?.cost).toEqual({ amount: expect.stringMatching(/^\d+\.\d{2}$/), currency: "EUR" });
    expect(body.series.every((point) => point.revenue !== undefined && point.partner_cost !== undefined)).toBe(true);
    expect(body.on_time_target).toBe(0.95);
  });

  it("leaves money and partners out for staff without payment.read and partner.read", async () => {
    const body = await range(PRODUCTION_LEAD, lastDays(30));
    expect(body.current.orders).toEqual({ placed: expect.any(Number) });
    expect(body.previous.orders).toEqual({ placed: expect.any(Number) });
    expect(body.current.customers.top.every((customer) => !("revenue" in customer))).toBe(true);
    expect(body.current).not.toHaveProperty("customers.slow_payers");
    expect(body.current).not.toHaveProperty("partners");
    expect(body.current.production.defects_by_kind.length).toBeGreaterThan(0);
    for (const point of body.series) {
      expect(point).not.toHaveProperty("revenue");
      expect(point).not.toHaveProperty("average_value");
      expect(point).not.toHaveProperty("partner_cost");
      expect(point.previous).not.toHaveProperty("revenue");
    }
  });

  it("gives staff with payment.read but not partner.read the money and no partners", async () => {
    const body = await range(SALES_LEAD, lastDays(30));
    expect(body.current.orders.revenue).toBeDefined();
    expect(body.current.orders.by_product).toBeDefined();
    expect(body.current.customers.slow_payers).toBeDefined();
    expect(body.current).not.toHaveProperty("partners");
    expect(body.series[0]).toHaveProperty("revenue");
    expect(body.series[0]).not.toHaveProperty("partner_cost");
  });

  it("picks days up to 31 days, weeks up to 183 and months beyond", async () => {
    const days = await range(STAFF, lastDays(30));
    expect(days.range.bucket).toBe("day");
    expect(days.series).toHaveLength(30);

    // A week bucket starts on the range's first day or on a Monday; a month bucket on the first day or on the 1st.
    const weeks = await range(STAFF, lastDays(90));
    expect(weeks.range.bucket).toBe("week");
    expect(weeks.series).toHaveLength(1 + datesAfter(weeks.range.from, weeks.range.to).filter((date) => weekday(date) === 1).length);
    for (const point of weeks.series.slice(1)) expect(weekday(point.start)).toBe(1);

    const months = await range(STAFF, lastDays(366));
    expect(months.range.bucket).toBe("month");
    expect(months.series).toHaveLength(1 + datesAfter(months.range.from, months.range.to).filter((date) => date.endsWith("-01")).length);
    for (const point of months.series.slice(1)) expect(point.start.endsWith("-01")).toBe(true);
  });

  it("clips the first and last bucket to the range and covers every day", async () => {
    const body = await range(STAFF, lastDays(90));
    expect(body.series[0]!.start).toBe(body.range.from);
    expect(body.series.reduce((sum, point) => sum + point.days, 0)).toBe(90);
    for (const [index, point] of body.series.slice(1).entries()) {
      const before = body.series[index]!;
      expect(point.start).toBe(addDays(before.start, before.days));
    }
  });

  it("forces days with bucket=day", async () => {
    const body = await range(STAFF, `${lastDays(366)}&bucket=day`);
    expect(body.range.bucket).toBe("day");
    expect(body.series).toHaveLength(366);
  });

  it("puts the period before right ahead, with as many days", async () => {
    const from = addDays(today(), -40);
    const to = addDays(today(), -34);
    const body = await range(STAFF, `from=${from}&to=${to}`);
    expect(body.range).toMatchObject({ from, to, previous_from: addDays(from, -7), previous_to: addDays(from, -1) });
    expect(body.series[0]!.previous.orders_placed).toBeGreaterThan(0);
  });

  it("has every bucket, with zeros and no rates, where there are no orders", async () => {
    const body = await range(STAFF, "from=2001-01-01&to=2001-01-10");
    expect(body.series).toHaveLength(10);
    expect(body.series[0]).toMatchObject({ orders_placed: 0, revenue: "0.00", average_value: null, on_time_rate: null, defect_rate: null });
    expect(body.current.orders).toMatchObject({ placed: 0, revenue: "0.00" });
  });

  it("has fewer orders at weekends", async () => {
    const body = await range(STAFF, lastDays(28));
    const byDay = new Map(body.series.map((point) => [new Date(`${point.start}T00:00:00Z`).getUTCDay(), point.orders_placed]));
    expect(byDay.get(6)!).toBeLessThan(byDay.get(3)!);
    expect(byDay.get(0)!).toBeLessThan(byDay.get(3)!);
  });

  it("adds the series up to the totals", async () => {
    const body = await range(STAFF, lastDays(90));
    expect(body.series.reduce((sum, point) => sum + point.orders_placed, 0)).toBe(body.current.orders.placed);
    const cents = (money: string) => Number(money.replace(".", ""));
    expect(body.series.reduce((sum, point) => sum + cents(point.revenue!), 0)).toBe(cents(body.current.orders.revenue!));
  });

  it("refuses a bad query with a field error", async () => {
    const before = await call(STAFF, "/reports/range?from=2026-11-02&to=2026-11-01");
    expect(before.status).toBe(400);
    expect(((await before.json()) as { errors: { path: string }[] }).errors[0]!.path).toBe("to");

    const long = await call(STAFF, "/reports/range?from=2025-01-01&to=2026-01-02");
    expect(long.status).toBe(400);
    expect(((await long.json()) as { errors: { path: string }[] }).errors[0]!.path).toBe("to");

    expect((await call(STAFF, "/reports/range?from=2026-01-01&to=2026-01-31&bucket=week")).status).toBe(400);
    expect((await call(STAFF, "/reports/range?from=2026-01-01")).status).toBe(400);
    expect((await call(STAFF, "/reports/range?from=2026-02-30&to=2026-03-01")).status).toBe(400);
  });

  it("refuses staff without report.read", async () => {
    expect((await call(CLERK, `/reports/range?${lastDays(30)}`)).status).toBe(403);
    expect((await call(CLERK, "/reports/dashboard")).status).toBe(403);
  });

  it("answers the same numbers every time", async () => {
    const first = await range(STAFF, lastDays(30));
    const second = await range(STAFF, lastDays(30));
    expect(second.series).toEqual(first.series);
    expect(second.current).toEqual(first.current);
  });

  it("gives a date the same numbers whatever day it is today", () => {
    // 2026-11-16 is 9,814 days after the run's epoch (a Monday): 9 orders of 270.00, one crack in 27 pieces.
    const query = new URLSearchParams({ from: "2026-11-16", to: "2026-11-16" });
    const rangeAt = (isoNow: string) => {
      const answer = createReportsStore(() => Date.parse(isoNow)).range(query, STAFF.permissions);
      if (!answer.ok) throw new Error("expected a body");
      return answer.body;
    };
    const monday = rangeAt("2026-11-22T10:00:00Z");
    expect(monday.series).toHaveLength(1);
    expect(monday.series[0]).toMatchObject({
      start: "2026-11-16",
      days: 1,
      orders_placed: 9,
      revenue: "2430.00",
      average_value: "270.00",
      on_time_rate: 1,
      defect_rate: 0.037,
      partner_cost: "850.50",
    });
    expect(monday.current.production.defects_by_kind).toEqual([expect.objectContaining({ key: "crack", count: 1 })]);
    expect(monday.current.partners?.cost).toEqual({ amount: "850.50", currency: "EUR" });
    expect(rangeAt("2026-12-03T23:59:00Z").series[0]).toEqual(monday.series[0]);
  });

  it("works from a fixed day for the store itself", () => {
    const store = createReportsStore(() => Date.parse("2026-11-22T10:00:00Z"));
    const answer = store.range(new URLSearchParams({ from: "2026-11-16", to: "2026-11-22" }), STAFF.permissions);
    if (!answer.ok) throw new Error("expected a body");
    expect(answer.body.series).toHaveLength(7);
    expect(answer.body.current.orders.placed).toBe(answer.body.series.reduce((sum, point) => sum + point.orders_placed, 0));
  });
});

describe("fake erp-api /reports/dashboard", () => {
  async function dashboard(user: FakeUser): Promise<DashboardResponse> {
    const response = await call(user, "/reports/dashboard");
    expect(response.status).toBe(200);
    return (await response.json()) as DashboardResponse;
  }

  it("has production only with workflow.read", async () => {
    expect((await dashboard(PRODUCTION_LEAD)).production?.wip.length).toBeGreaterThan(0);
    expect((await dashboard(STAFF)).production?.wip.length).toBeGreaterThan(0);
    expect(await dashboard(SALES_LEAD)).not.toHaveProperty("production");
  });

  it("has ai only for staff with report, payment and partner reads", async () => {
    expect((await dashboard(STAFF)).ai).toMatchObject({ enabled: true, pending: false });
    expect(await dashboard(PRODUCTION_LEAD)).not.toHaveProperty("ai");
    expect(await dashboard(SALES_LEAD)).not.toHaveProperty("ai");
  });

  it("cuts the weeks like the range", async () => {
    const lead = await dashboard(PRODUCTION_LEAD);
    expect(lead.current.orders).toEqual({ placed: expect.any(Number) });
    expect(lead.current).not.toHaveProperty("partners");
    const full = await dashboard(STAFF);
    expect(full.current.orders.revenue).toBeDefined();
    expect(full.current.partners?.load.length).toBeGreaterThan(0);
    expect(full.week.start <= today()).toBe(true);
    expect(addDays(full.week.start, -7)).toBe(full.week.previous_start);
  });

  it("builds attention from the orders themselves", async () => {
    const groups = (await dashboard(STAFF)).attention;
    const labels = (kind: string) => groups.find((group) => group.kind === kind)?.items.map((item) => item.label) ?? [];
    expect(labels("awaiting_payment").toSorted()).toEqual(["#1045 · Kestrel Labs", "#1046 · Halden Audio"]);
    expect(labels("invoice_overdue")[0]).toContain("#1047 · Pinewood Instruments");
    expect(labels("order_at_risk")).toContain("#1041 · Fieldnote Studio");
    expect(groups.find((group) => group.kind === "awaiting_payment")?.total).toBe(2);
  });

  it("lists each attention kind only for who may read its list", async () => {
    const kinds = async (user: FakeUser) => (await dashboard(user)).attention.map((group) => group.kind);
    expect(await kinds(PRODUCTION_LEAD)).toEqual(expect.arrayContaining(["order_at_risk", "job_overdue", "defect_spike"]));
    expect(await kinds(PRODUCTION_LEAD)).not.toContain("awaiting_payment");
    expect(await kinds(SALES_LEAD)).toContain("awaiting_payment");
    expect(await kinds(SALES_LEAD)).not.toContain("offer_unanswered");
    expect(await kinds(STAFF)).toContain("offer_unanswered");
    for (const group of (await dashboard(STAFF)).attention) expect(group.items.length).toBeLessThanOrEqual(20);
  });
});

describe("fake erp-api briefing", () => {
  const ids = (body: DashboardResponse) => {
    if (!body.ai?.enabled || !body.ai.briefing) throw new Error("expected a briefing");
    return body.ai.briefing.suggestions.map((suggestion) => suggestion.id);
  };

  async function dashboard(): Promise<DashboardResponse> {
    return (await (await call(STAFF, "/reports/dashboard")).json()) as DashboardResponse;
  }

  it("dismisses a suggestion and brings it back with an undo", async () => {
    const [first] = ids(await dashboard());
    expect((await call(STAFF, `/reports/dashboard/suggestions/${first}/dismiss`, "POST")).status).toBe(204);

    const after = await dashboard();
    expect(ids(after)).not.toContain(first);
    const dismissed = after.ai?.enabled ? after.ai.dismissed : [];
    expect(dismissed).toHaveLength(1);

    expect((await call(STAFF, `/reports/dashboard/dismissals/${dismissed[0]!.id}`, "DELETE")).status).toBe(204);
    expect(ids(await dashboard())).toContain(first);
  });

  it("answers 204 for dismissing a suggestion again and replaces its dismissal, newest first", async () => {
    const [first, second] = ids(await dashboard());
    expect((await call(STAFF, `/reports/dashboard/suggestions/${first}/dismiss`, "POST")).status).toBe(204);
    expect((await call(STAFF, `/reports/dashboard/suggestions/${second}/dismiss`, "POST")).status).toBe(204);
    expect((await call(STAFF, `/reports/dashboard/suggestions/${first}/dismiss`, "POST")).status).toBe(204);

    const ai = (await dashboard()).ai;
    const dismissed = ai?.enabled ? ai.dismissed : [];
    expect(dismissed).toHaveLength(2);
    // The one dismissed again (an offer_job) is the newest, so it comes first.
    expect(dismissed.map((one) => one.kind)).toEqual(["offer_job", "chase_invoice"]);
    expect(dismissed[0]!.dismissed_at >= dismissed[1]!.dismissed_at).toBe(true);
  });

  it("brings a suggestion back in its original place", async () => {
    const [first, second, third] = ids(await dashboard());
    expect((await call(STAFF, `/reports/dashboard/suggestions/${second}/dismiss`, "POST")).status).toBe(204);
    const ai = (await dashboard()).ai;
    const dismissal = ai?.enabled ? ai.dismissed[0]! : null;
    expect((await call(STAFF, `/reports/dashboard/dismissals/${dismissal!.id}`, "DELETE")).status).toBe(204);
    expect(ids(await dashboard())).toEqual([first, second, third]);
  });

  it("answers 404 for an unknown suggestion", async () => {
    expect((await call(STAFF, "/reports/dashboard/suggestions/00000000-0000-4000-8000-000000000000/dismiss", "POST")).status).toBe(404);
  });

  it("is pending on the first read after asking and written on the next, and refuses a second ask within 15 minutes", async () => {
    expect(fakeState().reports.writeBriefing(null).ok).toBe(true);
    const pending = await dashboard();
    expect(pending.ai).toMatchObject({ enabled: true, pending: true });
    const written = await dashboard();
    expect(written.ai).toMatchObject({ enabled: true, pending: false });
    expect(Date.now() - Date.parse(written.ai?.enabled && written.ai.briefing ? written.ai.briefing.created_at : "0")).toBeLessThan(15 * 60_000);
    expect((await call(STAFF, "/reports/dashboard/briefing", "POST")).status).toBe(409);
  });

  it("answers 403 without the reads the briefing needs", async () => {
    expect((await call(PRODUCTION_LEAD, "/reports/dashboard/briefing", "POST")).status).toBe(403);
    expect((await call(SALES_LEAD, "/reports/dashboard/suggestions/00000000-0000-4000-8000-000000000000/dismiss", "POST")).status).toBe(403);
  });

  it("answers 409 when AI is off", async () => {
    fakeState().reports.setAiOff("limit_used");
    expect((await call(STAFF, "/reports/dashboard/briefing", "POST")).status).toBe(409);
    expect((await dashboard()).ai).toEqual({ enabled: false, reason: "limit_used" });
  });
});
