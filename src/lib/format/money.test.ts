import { describe, expect, it } from "vitest";

import { formatMoney } from "./money";

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
