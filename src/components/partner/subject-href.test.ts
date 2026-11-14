import { describe, expect, it } from "vitest";

import { partnerSubjectHref } from "./subject-href";

describe("partnerSubjectHref", () => {
  it("opens the job a notice is for", () => {
    expect(partnerSubjectHref({ subject: { type: "job_assignment", id: "a1" }, job: { id: "g1", partner_id: "p2" } }, "p1")).toBe("/partner-portal/p2/jobs/g1");
  });

  it("opens Jobs for a notice with no job", () => {
    expect(partnerSubjectHref({ subject: { type: "job_assignment", id: "a1" }, job: null }, "p1")).toBe("/partner-portal/p1/jobs");
  });

  it("opens nothing else", () => {
    expect(partnerSubjectHref({ subject: { type: "payout", id: "a1" }, job: null }, "p1")).toBeNull();
  });
});
