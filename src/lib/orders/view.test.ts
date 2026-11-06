import { describe, expect, it } from "vitest";

import { DEFAULT_VIEW, countsQuery, defaultSort, listQuery, viewKey } from "./view";

describe("orders view", () => {
  it("keys a view by what differs from the defaults", () => {
    expect(viewKey(DEFAULT_VIEW)).toBe("");
    expect(viewKey({ ...DEFAULT_VIEW, reason: "late" })).toBe("reason=late");
    expect(viewKey({ ...DEFAULT_VIEW, tab: "ready" })).not.toBe(viewKey({ ...DEFAULT_VIEW, tab: "all" }));
  });

  it("sorts by promised date on open tabs and newest on the rest", () => {
    expect(defaultSort("needs")).toBe("promised_on");
    expect(defaultSort("ready")).toBe("promised_on");
    expect(defaultSort("all")).toBe("-placed_at");
    expect(defaultSort("shipped")).toBe("-placed_at");
  });

  it("asks for every reason on Needs you, or the one picked", () => {
    expect(listQuery(DEFAULT_VIEW)).toEqual({ needs: "late,to_ship,to_collect,due_soon", sort: "promised_on", limit: 50 });
    expect(listQuery({ ...DEFAULT_VIEW, reason: "late" }).needs).toBe("late");
  });

  it("asks for the state of a state tab", () => {
    expect(listQuery({ ...DEFAULT_VIEW, tab: "in_production" })).toEqual({ state: "in_production", sort: "promised_on", limit: 50 });
    expect(listQuery({ ...DEFAULT_VIEW, tab: "all" })).toEqual({ sort: "-placed_at", limit: 50 });
  });

  it("sends the day after 'to' as promised_before", () => {
    const query = listQuery({ ...DEFAULT_VIEW, from: "2026-11-01", to: "2026-11-30" });
    expect(query.promised_after).toBe("2026-11-01");
    expect(query.promised_before).toBe("2026-12-01");
  });

  it("gives the counts only the filters that don't pick a tab", () => {
    expect(countsQuery({ ...DEFAULT_VIEW, tab: "ready", reason: null, payment: ["paid"], q: "luna", sort: "-placed_at" })).toEqual({
      payment_state: "paid",
      q: "luna",
    });
  });
});
