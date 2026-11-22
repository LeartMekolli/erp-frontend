import { describe, expect, it } from "vitest";
import {
  amountForScale,
  compactAxis,
  labelIndexes,
  niceTicks,
  percentAxis,
  runsOf,
  toDate,
} from "./scale-helpers";

describe("toDate", () => {
  it("is midnight of that calendar day in the reader's own time zone", () => {
    const date = toDate("2026-11-22");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10);
    expect(date.getDate()).toBe(22);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
  });
});

describe("labelIndexes", () => {
  it("returns every index for a small count", () => {
    expect(labelIndexes(0)).toEqual([]);
    expect(labelIndexes(3)).toEqual([0, 1, 2]);
    expect(labelIndexes(5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("thins a large count to five, always including the first and last", () => {
    const picked = labelIndexes(30);
    expect(picked).toEqual([0, 7, 15, 22, 29]);
    expect(picked[0]).toBe(0);
    expect(picked[picked.length - 1]).toBe(29);
  });
});

describe("runsOf", () => {
  it("splits at items with no dot and drops empty runs", () => {
    const runs = runsOf([1, null, 2, 3, null, null, 4], (v) =>
      v === null ? null : { x: v, y: v * 10 },
    );
    expect(runs).toEqual([
      [{ x: 1, y: 10 }],
      [
        { x: 2, y: 20 },
        { x: 3, y: 30 },
      ],
      [{ x: 4, y: 40 }],
    ]);
  });

  it("is empty when nothing has a dot", () => {
    expect(runsOf([null, null], () => null)).toEqual([]);
  });
});

describe("amountForScale", () => {
  it("reads an amount string as a number", () => {
    expect(amountForScale("1234.50")).toBe(1234.5);
  });

  it("throws on something that is not an amount", () => {
    expect(() => amountForScale("x")).toThrow();
  });
});

describe("niceTicks", () => {
  it("steps in round numbers up to the maximum", () => {
    expect(niceTicks(2870)).toEqual([0, 1000, 2000, 3000]);
  });

  it("is just zero when there is nothing to show", () => {
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe("compactAxis", () => {
  it("shortens thousands with the currency", () => {
    expect(compactAxis(12500, "EUR")).toBe("€12.5K");
  });

  it("shortens thousands without a currency", () => {
    expect(compactAxis(1200)).toBe("1.2K");
  });

  it("writes zero plainly", () => {
    expect(compactAxis(0, "EUR")).toBe("€0");
  });
});

describe("percentAxis", () => {
  it("shows a rate as a percentage", () => {
    expect(percentAxis(0.95)).toBe("95%");
  });
});
