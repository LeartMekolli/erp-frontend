import { describe, expect, it } from "vitest";

import type { OwedJob } from "@/lib/api/schema-types";

import { jobsCount, owedJobWords, owedNow, PAYOUT_STATUS, payoutJobAmount, signOf } from "./labels";

function job(fields: Partial<OwedJob>): OwedJob {
  return {
    assignment_id: "a",
    group_id: "g",
    product: { name: "Ring" },
    quantity: 10,
    state: "owed",
    holding: "with_you",
    amount: "120.00",
    paid: "0.00",
    due: "120.00",
    ...fields,
  };
}

const words = (fields: Partial<OwedJob>) => owedJobWords(job(fields), "EUR");

describe("signOf", () => {
  it("reads a sign from the string", () => {
    expect(signOf("0.00")).toBe(0);
    expect(signOf("-0.00")).toBe(0);
    expect(signOf("0")).toBe(0);
    expect(signOf("-40.00")).toBe(-1);
    expect(signOf("0.01")).toBe(1);
    expect(signOf("1240.00")).toBe(1);
  });
});

describe("owedNow", () => {
  it("shows nothing owed for zero or less", () => {
    expect(owedNow({ due_total: "-40.00", currency: "EUR" })).toBe("€0.00");
    expect(owedNow({ due_total: "0.00", currency: "EUR" })).toBe("€0.00");
    expect(owedNow({ due_total: "1240.00", currency: "EUR" })).toBe("€1,240.00");
  });
});

describe("jobsCount", () => {
  it("counts jobs", () => {
    expect(jobsCount(1)).toBe("1 job");
    expect(jobsCount(3)).toBe("3 jobs");
  });
});

describe("PAYOUT_STATUS", () => {
  it("words each payout status", () => {
    expect(PAYOUT_STATUS).toEqual({
      pending: "On its way",
      paid: "Paid",
      failed: "Failed. Owed to you again",
      reversed: "Reversed. Owed to you again",
    });
  });
});

describe("owedJobWords", () => {
  it("words a job taken back or cancelled with nothing owed", () => {
    expect(words({ holding: "taken_back", amount: "0.00", paid: "0.00", due: "0.00" })).toEqual(["Taken back, nothing owed"]);
    expect(words({ holding: "cancelled", amount: "0.00", paid: "0.00", due: "0.00" })).toEqual(["Cancelled, nothing owed"]);
  });

  it("words a job taken back or cancelled with an amount set", () => {
    expect(words({ holding: "cancelled", amount: "40.00", paid: "0.00", due: "40.00" })).toEqual(["Cancelled", "Owed"]);
    expect(words({ holding: "taken_back", amount: "40.00", paid: "40.00", due: "0.00" })).toEqual(["Taken back", "Paid"]);
  });

  it("words a job paid and then corrected back before the payout step", () => {
    expect(words({ state: "not_yet", amount: "300.00", paid: "300.00", due: "-300.00" })).toEqual([
      "Still being made",
      "€300.00 taken off your next payout",
    ]);
  });

  it("words a job still being made", () => {
    expect(words({ state: "not_yet", paid: "0.00", due: "0.00" })).toEqual(["Still being made"]);
  });

  it("words an overpaid job", () => {
    expect(words({ amount: "80.00", paid: "120.00", due: "-40.00" })).toEqual(["Taken off your next payout"]);
  });

  it("words an owed job by what's been paid", () => {
    expect(words({ due: "120.00", paid: "0.00" })).toEqual(["Owed"]);
    expect(words({ due: "60.00", paid: "60.00" })).toEqual(["Partly paid"]);
    expect(words({ due: "0.00", paid: "120.00" })).toEqual(["Paid"]);
  });
});

describe("payoutJobAmount", () => {
  it("words a payout job's amount", () => {
    expect(payoutJobAmount("300.00", "EUR")).toBe("€300.00");
    expect(payoutJobAmount("-40.00", "EUR")).toBe("Taken back: €40.00");
  });
});
