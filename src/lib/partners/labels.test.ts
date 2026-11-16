import { describe, expect, it } from "vitest";

import type { StaffOwedJob } from "@/lib/api/schema-types";

import { orderRef, PARTNER_STATUS, PAYOUT_ACCOUNT, STAFF_PAYOUT_STATUS, staffOwedJobWords } from "./labels";

function job(fields: Partial<StaffOwedJob>): StaffOwedJob {
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
    override_reason: null,
    customer_paid: true,
    order: null,
    ...fields,
  };
}

const words = (fields: Partial<StaffOwedJob>) => staffOwedJobWords(job(fields), "EUR");

describe("staffOwedJobWords", () => {
  it("words each owed job for staff", () => {
    expect(words({ state: "not_yet", amount: "300.00", paid: "300.00", due: "-300.00" })).toEqual([
      "Still being made",
      "€300.00 comes off the next payout",
    ]);
    expect(words({ state: "not_yet", paid: "0.00", due: "0.00" })).toEqual(["Still being made"]);
    expect(words({ amount: "80.00", paid: "120.00", due: "-40.00" })).toEqual(["Overpaid, comes off the next payout"]);
    expect(words({ holding: "cancelled", amount: "40.00", paid: "0.00", due: "40.00" })).toEqual(["Cancelled", "Owed"]);
    expect(words({ holding: "taken_back", amount: "0.00", paid: "0.00", due: "0.00" })).toEqual(["Taken back, nothing owed"]);
    expect(words({ due: "120.00", paid: "0.00" })).toEqual(["Owed"]);
    expect(words({ due: "60.00", paid: "60.00" })).toEqual(["Partly paid"]);
    expect(words({ due: "0.00", paid: "120.00" })).toEqual(["Paid"]);
  });
});

describe("orderRef", () => {
  it("names a job's order", () => {
    expect(orderRef({ id: "o", number: 1042, line_position: 1 })).toBe("Order #1042 · line 2");
  });
});

describe("partner words", () => {
  it("words every status and account state", () => {
    expect(PARTNER_STATUS).toEqual({ setting_up: "Setting up", approved: "Approved", suspended: "Suspended" });
    expect(PAYOUT_ACCOUNT).toEqual({
      ready: "Payouts ready",
      not_connected: "Payouts not set up",
      onboarding: "Setting up payouts",
      restricted: "The payment provider needs more from this partner",
    });
    expect(STAFF_PAYOUT_STATUS).toEqual({
      pending: "On its way",
      paid: "Paid",
      failed: "Failed. Owed again",
      reversed: "Reversed. Owed again",
    });
  });
});
