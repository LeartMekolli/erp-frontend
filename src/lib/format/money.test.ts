import { describe, expect, it } from "vitest";

import { addMoney, formatMoney } from "./money";

describe("addMoney", () => {
  it("adds two-decimal amounts", () => {
    expect(addMoney("410.00", "12.00")).toBe("422.00");
  });

  it("is exact where floats are not", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
  });

  it("keeps the decimals of an amount with a whole number", () => {
    expect(addMoney("19.99", "0")).toBe("19.99");
  });

  it("adds a negative amount", () => {
    expect(addMoney("-5.50", "10.25")).toBe("4.75");
  });

  it("uses as many decimals as the longer amount", () => {
    expect(addMoney("1.5", "0.25")).toBe("1.75");
  });

  it("keeps large amounts exact", () => {
    expect(addMoney("999999999999.99", "0.01")).toBe("1000000000000.00");
  });

  it("reads a zero sum as 0, never -0", () => {
    expect(addMoney("-1.00", "1.00")).toBe("0.00");
  });

  it("keeps the sign of a negative sum under one unit", () => {
    expect(addMoney("-0.50", "0.25")).toBe("-0.25");
  });

  it("refuses a value that is not an amount", () => {
    expect(() => addMoney("1e3", "1")).toThrow("Not a money amount");
    expect(() => addMoney("1", "")).toThrow("Not a money amount");
  });
});

describe("formatMoney", () => {
  it("formats a two-decimal amount", () => {
    expect(formatMoney("1234.50", "EUR")).toBe("€1,234.50");
  });

  it("keeps large amounts exact", () => {
    expect(formatMoney("1234567890123.45", "EUR")).toBe("€1,234,567,890,123.45");
  });

  it("rounds sub-cent amounts half up to the minor unit", () => {
    expect(formatMoney("0.125000", "EUR")).toBe("€0.13");
  });

  it("keeps the sign", () => {
    expect(formatMoney("-12.00", "GBP")).toBe("-£12.00");
  });

  it("shows no decimals for a zero-decimal currency", () => {
    expect(formatMoney("1500", "JPY")).toBe("JP¥1,500");
  });

  it.each(["1e3", "12,50", "", "NaN", " 12.00"])("refuses %j", (amount) => {
    expect(() => formatMoney(amount, "EUR")).toThrow("Not a money amount");
  });
});
