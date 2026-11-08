import { describe, expect, it } from "vitest";

import type { LinePartner } from "@/lib/api/schema-types";

import { partnerStatus } from "./line-partner";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const partner = (overrides: Partial<LinePartner>): LinePartner => ({
  id: "2f1c5d7e-0a9b-4e3c-8d2f-6a5b4c3d2e10",
  name: "Northcast Foundry",
  status: "offered",
  expires_at: null,
  ...overrides,
});

describe("partnerStatus", () => {
  it("is in-house with no partner", () => {
    expect(partnerStatus(null, NOW)).toEqual({ kind: "in_house" });
  });

  it("is accepted once the partner has said yes", () => {
    expect(partnerStatus(partner({ status: "accepted" }), NOW)).toEqual({ kind: "accepted", name: "Northcast Foundry" });
  });

  it("is offered until its deadline", () => {
    const expires_at = "2026-11-08T16:00:00Z";
    expect(partnerStatus(partner({ expires_at }), NOW)).toEqual({ kind: "offered", name: "Northcast Foundry", expiresAt: expires_at });
  });

  it("is offered with no deadline for an offer that has none", () => {
    expect(partnerStatus(partner({}), NOW)).toMatchObject({ kind: "offered", expiresAt: null });
  });

  it("is expired a minute past the deadline, though erp-api still says offered", () => {
    expect(partnerStatus(partner({ expires_at: "2026-11-08T11:59:00Z" }), NOW)).toEqual({
      kind: "offer_expired",
      name: "Northcast Foundry",
    });
  });
});
