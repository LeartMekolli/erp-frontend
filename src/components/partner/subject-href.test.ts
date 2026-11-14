import { describe, expect, it } from "vitest";

import { partnerSubjectHref } from "./subject-href";

describe("partnerSubjectHref", () => {
  it("opens Jobs from a job notice", () => {
    expect(partnerSubjectHref({ type: "job_assignment", id: "a1" }, "p1")).toBe("/partner-portal/p1/jobs");
  });

  it("opens nothing else", () => {
    expect(partnerSubjectHref({ type: "payout", id: "a1" }, "p1")).toBeNull();
  });
});
