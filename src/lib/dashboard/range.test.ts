import { describe, expect, it } from "vitest";

import { DEFAULT_CHOICE, checkCustomRange, previousRangeWords, rangeWords, resolveRange, type RangeChoice } from "./range";

describe("previousRangeWords", () => {
  it("counts the days of the range, both ends included", () => {
    expect(previousRangeWords({ from: "2026-10-26", to: "2026-11-24" })).toBe("previous 30 days");
    expect(previousRangeWords({ from: "2026-11-18", to: "2026-11-24" })).toBe("previous 7 days");
    expect(previousRangeWords({ from: "2025-12-28", to: "2026-01-03" })).toBe("previous 7 days");
  });

  it("says previous day for a single day", () => {
    expect(previousRangeWords({ from: "2026-11-24", to: "2026-11-24" })).toBe("previous day");
  });
});

describe("DEFAULT_CHOICE", () => {
  it("is the last 30 days", () => {
    expect(DEFAULT_CHOICE).toEqual({ preset: "30d" } satisfies RangeChoice);
  });
});

describe("resolveRange", () => {
  it("ends every preset today and counts both ends", () => {
    expect(resolveRange({ preset: "7d" }, "2026-11-22")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(resolveRange({ preset: "30d" }, "2026-11-22")).toEqual({ from: "2026-10-24", to: "2026-11-22" });
    expect(resolveRange({ preset: "quarter" }, "2026-11-22")).toEqual({ from: "2026-10-01", to: "2026-11-22" });
    expect(resolveRange({ preset: "year" }, "2026-11-22")).toEqual({ from: "2026-01-01", to: "2026-11-22" });
  });

  it("starts the quarter at its first month", () => {
    expect(resolveRange({ preset: "quarter" }, "2026-03-31").from).toBe("2026-01-01");
    expect(resolveRange({ preset: "quarter" }, "2026-04-01").from).toBe("2026-04-01");
    expect(resolveRange({ preset: "quarter" }, "2026-09-30").from).toBe("2026-07-01");
  });

  it("counts 7 and 30 days across a year end", () => {
    expect(resolveRange({ preset: "7d" }, "2026-01-03")).toEqual({ from: "2025-12-28", to: "2026-01-03" });
    expect(resolveRange({ preset: "30d" }, "2026-01-03")).toEqual({ from: "2025-12-05", to: "2026-01-03" });
  });

  it("returns a custom range as given", () => {
    expect(resolveRange({ from: "2026-02-01", to: "2026-02-10" }, "2026-11-22")).toEqual({ from: "2026-02-01", to: "2026-02-10" });
  });
});

describe("checkCustomRange", () => {
  it("refuses an end before the start", () => {
    expect(checkCustomRange("2026-11-02", "2026-11-01")).toBe("The end is before the start.");
  });

  it("allows 366 days and refuses 367", () => {
    expect(checkCustomRange("2025-01-01", "2026-01-01")).toBeNull();
    expect(checkCustomRange("2025-01-01", "2026-01-02")).toBe("Pick at most 366 days.");
  });

  it("asks for a valid date when either end is not a real date", () => {
    expect(checkCustomRange("", "2026-11-01")).toBe("Pick a valid date.");
    expect(checkCustomRange("2026-11-01", "tomorrow")).toBe("Pick a valid date.");
    expect(checkCustomRange("2026-02-30", "2026-03-05")).toBe("Pick a valid date.");
  });

  it("allows one day", () => {
    expect(checkCustomRange("2026-11-01", "2026-11-01")).toBeNull();
  });
});

describe("rangeWords", () => {
  it("names the presets", () => {
    expect(rangeWords({ preset: "7d" })).toBe("last 7 days");
    expect(rangeWords({ preset: "30d" })).toBe("last 30 days");
    expect(rangeWords({ preset: "quarter" })).toBe("this quarter");
    expect(rangeWords({ preset: "year" })).toBe("this year");
  });

  it("words a custom range inside a month", () => {
    expect(rangeWords({ from: "2026-10-01", to: "2026-10-31" })).toBe("1–31 Oct");
  });

  it("words a custom range across months", () => {
    expect(rangeWords({ from: "2026-10-28", to: "2026-11-03" })).toBe("28 Oct – 3 Nov");
  });

  it("words a custom range across years", () => {
    expect(rangeWords({ from: "2025-12-15", to: "2026-01-03" })).toBe("15 Dec 2025 – 3 Jan 2026");
  });

  it("words a single day", () => {
    expect(rangeWords({ from: "2026-10-05", to: "2026-10-05" })).toBe("5 Oct");
  });
});
