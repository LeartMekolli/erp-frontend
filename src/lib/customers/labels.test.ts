import { describe, expect, it } from "vitest";

import { formatMoney } from "@/lib/format/money";

import { creditLimitText, STATUS_LABEL, termsText } from "./labels";

describe("customer words", () => {
  it("names each status", () => {
    expect(STATUS_LABEL).toEqual({ active: "Active", disabled: "Disabled" });
  });

  it("says how a customer pays", () => {
    expect(termsText({ terms: "pay_first", days_to_pay: 30, credit_limit: null, currency: "EUR" })).toBe("Pay first");
    expect(termsText({ terms: "pay_later", days_to_pay: 30, credit_limit: null, currency: "EUR" })).toBe("Pay later · 30 days");
    expect(termsText({ terms: "pay_later", days_to_pay: 1, credit_limit: null, currency: "EUR" })).toBe("Pay later · 1 day");
  });

  it("says No limit for a null credit limit, and the amount otherwise", () => {
    expect(creditLimitText(null, "EUR")).toBe("No limit");
    expect(creditLimitText("5000.00", "EUR")).toBe(formatMoney("5000.00", "EUR"));
  });
});
