import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/schema-types";

import { daysBetween, linesSummary, promisedText, workspaceToday } from "./labels";

const line = (quantity: number, name: string) => ({ quantity, product: { name } }) as Order["lines"][number];

describe("order labels", () => {
  it("takes today from the workspace zone", () => {
    const lateEvening = Date.parse("2026-11-05T23:30:00Z");
    expect(workspaceToday("UTC", lateEvening)).toBe("2026-11-05");
    expect(workspaceToday("Pacific/Kiritimati", lateEvening)).toBe("2026-11-06");
    expect(workspaceToday("America/Los_Angeles", Date.parse("2026-11-05T03:00:00Z"))).toBe("2026-11-04");
  });

  it("counts whole days between calendar days", () => {
    expect(daysBetween("2026-11-04", "2026-11-12")).toBe(8);
    expect(daysBetween("2026-11-04", "2026-11-02")).toBe(-2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it.each([
    ["2026-11-04", false, "4 Nov · today"],
    ["2026-11-05", false, "5 Nov · tomorrow"],
    ["2026-11-12", false, "12 Nov · in 8 days"],
    ["2026-11-03", true, "3 Nov · 1 day late"],
    ["2026-11-02", true, "2 Nov · 2 days late"],
    ["2026-11-02", false, "2 Nov"],
    ["2027-01-15", false, "15 Jan 2027 · in 72 days"],
  ])("promised %s (late %s)", (day, late, text) => {
    expect(promisedText(day, "2026-11-04", late)).toBe(text);
  });

  it("summarises lines", () => {
    expect(linesSummary([line(40, "Bracket")])).toBe("40 × Bracket");
    expect(linesSummary([line(4, "Panel"), line(1, "Core"), line(8, "Truss")])).toBe("3 lines");
  });
});
