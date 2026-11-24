import { describe, expect, it } from "vitest";

import type { CapacityRow } from "@/lib/api/schema-types";

import { capacityWords, workloadSteps } from "./workload";

const row = (date: string, key: string, name: string, load: number, capacity: number, period: "day" | "week" = "day"): CapacityRow => ({
  date,
  step_type: { id: `id-${key}`, key, name },
  load,
  capacity,
  capacity_period: period,
});

describe("capacityWords", () => {
  it("says the capacity as the partner set it", () => {
    expect(capacityWords(50, "day")).toBe("50 a day");
    expect(capacityWords(50, "week")).toBe("50 a week");
  });
});

describe("workloadSteps", () => {
  // erp-api's order: oldest day first, then step order.
  const rows = [
    row("2026-11-01", "print_pattern", "Print pattern", 5, 60),
    row("2026-11-01", "casting", "Casting", 10, 50),
    row("2026-11-01", "polishing", "Polishing", 35, 40),
    row("2026-11-02", "print_pattern", "Print pattern", 6, 60),
    row("2026-11-02", "casting", "Casting", 46, 50),
    row("2026-11-02", "polishing", "Polishing", 10, 40),
  ];

  it("puts the busiest step on the latest day first", () => {
    expect(workloadSteps(rows).map((step) => step.key)).toEqual(["casting", "polishing", "print_pattern"]);
  });

  it("keeps each step's days as points, and its latest row", () => {
    const [casting] = workloadSteps(rows);
    expect(casting).toMatchObject({ key: "casting", name: "Casting" });
    expect(casting!.points).toEqual([
      { at: "2026-11-01", load: 10, capacity: 50, period: "day" },
      { at: "2026-11-02", load: 46, capacity: 50, period: "day" },
    ]);
    expect(casting!.latest).toEqual(rows[4]);
  });

  it("counts a step with no capacity and pieces waiting as the busiest, and with none as the least", () => {
    const steps = workloadSteps([
      ...rows,
      row("2026-11-02", "plating", "Plating", 3, 0, "week"),
      row("2026-11-02", "engraving", "Engraving", 0, 0),
    ]);
    expect(steps.map((step) => step.key)).toEqual(["plating", "casting", "polishing", "print_pattern", "engraving"]);
  });

  it("has nothing for no rows", () => {
    expect(workloadSteps([])).toEqual([]);
  });
});
