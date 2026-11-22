import { describe, expect, it } from "vitest";
import { amountForScale, compactAxis, niceTicks, percentAxis } from "./scale-helpers";

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
