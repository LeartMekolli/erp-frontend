import { describe, expect, it } from "vitest";

import type { PartnerRole } from "@/lib/api/schema-types";

import { partnerSubjectHref } from "./subject-href";

const owner = (): PartnerRole => "owner";
const member = (): PartnerRole => "member";

describe("partnerSubjectHref", () => {
  it("opens the job a notice is for", () => {
    expect(
      partnerSubjectHref({ subject: { type: "job_assignment", id: "a1" }, job: { id: "g1", partner_id: "p2" }, payout: null }, "p1", owner),
    ).toBe("/partner-portal/p2/jobs/g1");
  });

  it("opens Jobs for a notice with no job", () => {
    expect(partnerSubjectHref({ subject: { type: "job_assignment", id: "a1" }, job: null, payout: null }, "p1", owner)).toBe("/partner-portal/p1/jobs");
  });

  it("opens the paid workshop's earnings", () => {
    const roles: Record<string, PartnerRole> = { p1: "member", p2: "admin" };
    expect(
      partnerSubjectHref({ subject: { type: "payout", id: "o1" }, job: null, payout: { id: "o1", partner_id: "p2" } }, "p1", (id) => roles[id]),
    ).toBe("/partner-portal/p2/earnings");
  });

  it("doesn't link a member's old payout notice", () => {
    expect(partnerSubjectHref({ subject: { type: "payout", id: "o1" }, job: null, payout: { id: "o1", partner_id: "p1" } }, "p1", member)).toBeNull();
    expect(partnerSubjectHref({ subject: { type: "payout", id: "o1" }, job: null, payout: { id: "o1", partner_id: "p1" } }, "p1", () => undefined)).toBeNull();
  });

  it("opens nothing else", () => {
    expect(partnerSubjectHref({ subject: { type: "payout", id: "a1" }, job: null, payout: null }, "p1", owner)).toBeNull();
  });
});
