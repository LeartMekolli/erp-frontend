import { describe, expect, it } from "vitest";

import type { OwedJob } from "@/lib/api/schema-types";

import { type PayFact, payFacts } from "./pay-facts";

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

const facts = (fields: Partial<OwedJob>): PayFact[] => payFacts(job(fields));

describe("payFacts", () => {
  it("reads where a job's pay stands", () => {
    expect(facts({ holding: "taken_back", amount: "0.00", paid: "0.00", due: "0.00" })).toEqual([
      { kind: "lost", lost: "taken_back", nothingOwed: true },
    ]);
    expect(facts({ holding: "cancelled", amount: "0.00", paid: "0.00", due: "0.00" })).toEqual([
      { kind: "lost", lost: "cancelled", nothingOwed: true },
    ]);
    expect(facts({ holding: "cancelled", amount: "40.00", paid: "0.00", due: "40.00" })).toEqual([
      { kind: "lost", lost: "cancelled", nothingOwed: false },
      { kind: "owed" },
    ]);
    expect(facts({ holding: "taken_back", amount: "40.00", paid: "40.00", due: "0.00" })).toEqual([
      { kind: "lost", lost: "taken_back", nothingOwed: false },
      { kind: "paid" },
    ]);
    expect(facts({ state: "not_yet", amount: "300.00", paid: "300.00", due: "-300.00" })).toEqual([
      { kind: "making" },
      { kind: "making_overpaid", amount: "300.00" },
    ]);
    expect(facts({ state: "not_yet", paid: "0.00", due: "0.00" })).toEqual([{ kind: "making" }]);
    expect(facts({ amount: "80.00", paid: "120.00", due: "-40.00" })).toEqual([{ kind: "overpaid" }]);
    expect(facts({ due: "120.00", paid: "0.00" })).toEqual([{ kind: "owed" }]);
    expect(facts({ due: "60.00", paid: "60.00" })).toEqual([{ kind: "partly_paid" }]);
    expect(facts({ due: "0.00", paid: "120.00" })).toEqual([{ kind: "paid" }]);
  });
});
