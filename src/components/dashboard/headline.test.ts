import { describe, expect, it } from "vitest";

import type { DashboardRange, Permission } from "@/lib/api/schema-types";

import { createReportsStore } from "../../../test/fake-erp-api/reports";
import { PRODUCTION_LEAD, STAFF } from "../../../test/fake-erp-api/seed";

import { bucketLabel, change, heroMetrics, kpiMetrics, moneyChange, noOrdersWords, pickHero, previousWords } from "./headline";

const NOW = Date.parse("2026-11-22T12:00:00Z");

function rangeFor(permissions: readonly Permission[], from = "2026-10-24", to = "2026-11-22"): DashboardRange {
  const answer = createReportsStore(() => NOW).range(new URLSearchParams({ from, to }), permissions);
  if (!answer.ok) throw new Error("the fake refused the range");
  return answer.body;
}

/** A range as erp-api sends it to someone without `payment.read`, with no on-time rate either. */
function withoutRate(range: DashboardRange): DashboardRange {
  return { ...range, current: { ...range.current, production: { ...range.current.production, on_time_rate: null } } };
}

describe("pickHero", () => {
  it("leads with revenue when the reader may see it", () => {
    expect(pickHero(rangeFor(STAFF.permissions))).toBe("revenue");
  });

  it("leads with on time for a reader without revenue", () => {
    expect(pickHero(rangeFor(PRODUCTION_LEAD.permissions))).toBe("on_time");
  });

  it("leads with orders when there is neither revenue nor a rate", () => {
    expect(pickHero(withoutRate(rangeFor(PRODUCTION_LEAD.permissions)))).toBe("orders");
  });
});

describe("change", () => {
  it("counts a rate's change in points", () => {
    expect(change(0.91, 0.94, "up")).toEqual({ arrow: "▼", words: "3 pts", better: false });
  });

  it("calls a lower defect rate better", () => {
    expect(change(0.024, 0.03, "down")).toEqual({ arrow: "▼", words: "0.6 pts", better: true });
  });

  it("says 1 pt, not 1 pts", () => {
    expect(change(0.95, 0.94, "up")?.words).toBe("1 pt");
  });

  it("counts a count's change in percent", () => {
    expect(change(112, 100, "up", "count")).toEqual({ arrow: "▲", words: "12%", better: true });
  });

  it("says No change when nothing moved", () => {
    expect(change(0.5, 0.5, "up")).toEqual({ arrow: null, words: "No change", better: null });
    expect(change(0, 0, "up", "count")).toEqual({ arrow: null, words: "No change", better: null });
  });

  it("gives null when a side is missing, or a count grew from nothing", () => {
    expect(change(null, 0.9, "up")).toBeNull();
    expect(change(0.9, null, "up")).toBeNull();
    expect(change(5, 0, "up", "count")).toBeNull();
  });
});

describe("moneyChange", () => {
  it("reads the amounts as strings", () => {
    expect(moneyChange("48210.00", "43040.00", "up")).toEqual({ arrow: "▲", words: "12%", better: true });
    expect(moneyChange("90.10", "100", "up")).toEqual({ arrow: "▼", words: "10%", better: false });
  });

  it("gives null for a missing amount", () => {
    expect(moneyChange(undefined, "1.00", "up")).toBeNull();
    expect(moneyChange("1.00", null, "up")).toBeNull();
  });
});

describe("the metrics", () => {
  it("gives the hero's chips and the KPIs of a reader with every permission", () => {
    const range = rangeFor(STAFF.permissions);
    expect(heroMetrics(range).map((one) => one.label)).toEqual(["Revenue", "Orders placed", "Average order"]);
    expect(kpiMetrics(range).map((one) => one.label)).toEqual(["Orders placed", "Average order", "On time", "Defect rate"]);
  });

  it("drops money, and On time from the KPIs when it is the hero, without payment.read", () => {
    const range = rangeFor(PRODUCTION_LEAD.permissions);
    expect(heroMetrics(range).map((one) => one.label)).toEqual(["On time", "Orders placed"]);
    expect(kpiMetrics(range).map((one) => one.label)).toEqual(["Orders placed", "Defect rate"]);
  });

  it("words the revenue from erp-api's string", () => {
    const range = rangeFor(STAFF.permissions);
    const revenue = heroMetrics(range)[0]!;
    expect(revenue.figure).toBe(new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(range.current.orders.revenue as Intl.StringNumericLiteral));
    expect(revenue.values).toHaveLength(range.series.length);
  });
});

describe("words", () => {
  it("labels a day or week bucket by its day, a month by its month", () => {
    expect(bucketLabel("2026-11-16", "week")).toBe("16 Nov");
    expect(bucketLabel("2026-11-01", "month")).toBe("Nov 2026");
  });

  it("counts the range's days", () => {
    const range = rangeFor(STAFF.permissions);
    expect(noOrdersWords(range)).toBe("No orders in these 30 days");
    expect(previousWords(range)).toBe("previous 30 days");
  });
});
