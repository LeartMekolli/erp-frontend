import { describe, expect, it } from "vitest";

import type { Order, OrderCounts } from "../../src/lib/api/schema-types";

import { createOrdersStore, workingDaysAfter, type Answer, type Page } from "./orders";

/** Wednesday 4 November 2026, 10:00 UTC: the demo workspace's zone is UTC. */
const NOW = Date.parse("2026-11-04T10:00:00Z");

function store() {
  return createOrdersStore(() => NOW);
}

function ok<T>(answer: Answer<T>): T {
  if (!answer.ok) throw new Error(`expected a body, got ${answer.status}`);
  return answer.body;
}

const list = (s: ReturnType<typeof store>, params: Record<string, string>) =>
  ok<Page<Order>>(s.list(new URLSearchParams(params)));
const counts = (s: ReturnType<typeof store>, params: Record<string, string> = {}) =>
  ok<OrderCounts>(s.counts(new URLSearchParams(params)));
const byNumber = (s: ReturnType<typeof store>, number: number) => list(s, { limit: "200" }).data.find((o) => o.number === number)!;

describe("fake erp-api orders", () => {
  it("answers one order, with why it was cancelled", () => {
    const s = store();
    expect(ok(s.get(byNumber(s, 1054).id)).cancelled?.reason).toBe("Customer changed their mind");
    expect(s.get("00000000-0000-4000-8000-000000000000")).toMatchObject({ ok: false, status: 404 });
  });

  it("says what each line was made with", () => {
    const every = list(store(), { limit: "200" }).data.flatMap((o) => o.lines);
    expect(every.every((line) => line.options.length === 1)).toBe(true);
  });

  it("adds up what is still to collect, per currency", () => {
    const amounts = counts(store()).to_collect_amounts;
    expect(amounts).toEqual([{ currency: "EUR", amount: "2002.70" }]);
  });

  it("lists the needs-you orders, soonest promised first", () => {
    const page = list(store(), { needs: "late,to_ship,to_collect,due_soon", sort: "promised_on" });
    const days = page.data.map((o) => o.promised_on);
    expect(days).toEqual([...days].sort());
    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((o) => o.needs.length > 0)).toBe(true);
  });

  it("combines filters with AND and matches q on number or customer", () => {
    const s = store();
    expect(list(s, { q: "#104" }).data.map((o) => o.number).sort()).toEqual([1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049]);
    expect(list(s, { q: "fieldnote" }).data.map((o) => o.number)).toEqual([1041]);
    expect(list(s, { q: "104", state: "ready" }).data.map((o) => o.number).sort()).toEqual([1042, 1043, 1044]);
  });

  it("counts tabs and reasons, once per order in total", () => {
    const c = counts(store());
    const { total, ...reasons } = c.needs_you;
    expect(total).toBeLessThan(Object.values(reasons).reduce((a, b) => a + b, 0));
    expect(c.states.ready).toBe(3);
    expect(c.all).toBe(14);
  });

  it("pages with a cursor and refuses one made for another sort", () => {
    const s = store();
    const first = list(s, { limit: "5", sort: "promised_on" });
    expect(first.next_cursor).not.toBeNull();
    const second = list(s, { limit: "5", sort: "promised_on", cursor: first.next_cursor! });
    expect(second.data[0]!.id).not.toBe(first.data[0]!.id);
    const refused = s.list(new URLSearchParams({ sort: "-placed_at", cursor: first.next_cursor! }));
    expect(refused).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses an unknown state", () => {
    expect(store().list(new URLSearchParams({ state: "ready,lost" }))).toMatchObject({ ok: false, status: 400, errors: [{ path: "state" }] });
  });

  it("refuses state or needs on counts", () => {
    const s = store();
    expect(s.counts(new URLSearchParams({ state: "ready" }))).toMatchObject({ ok: false, status: 400 });
    expect(s.counts(new URLSearchParams({ needs: "late" }))).toMatchObject({ ok: false, status: 400 });
  });

  it("ships a ready order once, replays the same key", () => {
    const s = store();
    const order = byNumber(s, 1043);
    const first = ok(s.ship(order.id, { courier: "DHL", tracking: "JD0001" }, "k1"));
    expect(first.state).toBe("shipped");
    expect(ok(s.ship(order.id, { courier: "DHL", tracking: "JD0001" }, "k1"))).toEqual(first);
    expect(s.ship(order.id, { courier: "UPS" }, "k1")).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses to ship an order that is not ready, or already shipped", () => {
    const s = store();
    expect(s.ship(byNumber(s, 1041).id, {}, "a")).toMatchObject({ ok: false, status: 409, detail: "Order is not ready to ship" });
    expect(s.ship(byNumber(s, 1051).id, {}, "b")).toMatchObject({ ok: false, status: 409, detail: "Order already shipped" });
  });

  it("fails one label with 503, then buys it on retry with the same key", () => {
    const s = store();
    const order = byNumber(s, 1044);
    s.failNextLabel(order.id);
    expect(s.ship(order.id, { label: {} }, "k")).toMatchObject({ ok: false, status: 503 });
    expect(byNumber(s, 1044).state).toBe("ready");
    const shipped = ok(s.ship(order.id, { label: {} }, "k"));
    expect(shipped.shipping.label?.url).toBe("https://labels.example.test/1044.pdf");
  });

  it("refuses a label without a courier account, and a label with tracking", () => {
    const s = store();
    const order = byNumber(s, 1044);
    expect(s.ship(order.id, { label: {}, tracking: "X" }, "a")).toMatchObject({ ok: false, status: 400, errors: [{ path: "label" }] });
    s.setCourierAccount(false);
    expect(s.ship(order.id, { label: {} }, "b")).toMatchObject({ ok: false, status: 409, detail: "No courier account" });
  });

  it("records a payment by hand and starts a waiting order", () => {
    const s = store();
    const order = byNumber(s, 1045);
    const paid = ok(s.paidByHand(order.id, { reference: "BT-1", received_on: "2026-11-04" }, "k"));
    expect(paid.state).toBe("in_production");
    expect(paid.payment.state).toBe("paid");
    expect(s.paidByHand(order.id, { reference: "BT-2", received_on: "2026-11-04" }, "k2")).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a payment received after today", () => {
    const s = store();
    expect(s.paidByHand(byNumber(s, 1046).id, { reference: "BT-1", received_on: "2026-11-05" }, "k")).toMatchObject({
      ok: false,
      status: 400,
      errors: [{ path: "received_on" }],
    });
  });

  it("computes due_soon over working days only", () => {
    expect(workingDaysAfter("2026-11-06", 2)).toBe("2026-11-10");
    expect(workingDaysAfter("2026-11-04", 2)).toBe("2026-11-06");
  });
});
