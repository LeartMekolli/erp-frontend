import { describe, expect, it } from "vitest";

import type { MeResponse } from "@/lib/api/schema-types";

import { homeForSession, homePath, resolveDestination } from "./destination";

const A = "2f1c5d7e-0a9b-4e3c-8d2f-6a5b4c3d2e10";
const B = "7b6a5c4d-3e2f-4a1b-9c8d-0e1f2a3b4c20";

function me(
  memberships: { organisation_type: string; organisation_id: string }[],
  permissions: MeResponse["permissions"] = [],
): MeResponse {
  return {
    user: { id: "u", email: "e@x.test", name: "N", status: "active", locale: "en", created_at: "2026-01-01T00:00:00.000Z" },
    roles: [],
    permissions,
    memberships: memberships.map((m) => ({ ...m, role: "owner" })),
  };
}

describe("resolveDestination", () => {
  it("turns away someone with only customer memberships", () => {
    expect(resolveDestination(me([{ organisation_type: "customer", organisation_id: A }]))).toEqual({ kind: "customer" });
  });

  it("sends a partner with one workshop to its portal", () => {
    expect(resolveDestination(me([{ organisation_type: "partner", organisation_id: A }]))).toEqual({
      kind: "partner",
      partnerId: A,
      path: `/partner-portal/${A}`,
    });
  });

  it("asks a partner with several workshops to choose", () => {
    expect(
      resolveDestination(
        me([
          { organisation_type: "partner", organisation_id: A },
          { organisation_type: "partner", organisation_id: B },
        ]),
      ),
    ).toEqual({ kind: "choose-partner", partnerIds: [A, B], path: "/partner-portal" });
  });

  it("sends someone with no memberships and a permission to the staff home", () => {
    expect(resolveDestination(me([], ["order.read"]))).toEqual({ kind: "staff", path: "/" });
  });

  it("has no access with no memberships and no permissions", () => {
    expect(resolveDestination(me([], []))).toEqual({ kind: "no-access" });
  });

  it("treats someone with a customer and a partner membership as a partner", () => {
    expect(
      resolveDestination(
        me([
          { organisation_type: "customer", organisation_id: B },
          { organisation_type: "partner", organisation_id: A },
        ]),
      ),
    ).toMatchObject({ kind: "partner", partnerId: A });
  });
});

describe("homePath", () => {
  it("is the destination's path, or null for people who can't sign in", () => {
    expect(homePath({ kind: "staff", path: "/" })).toBe("/");
    expect(homePath({ kind: "partner", partnerId: A, path: `/partner-portal/${A}` })).toBe(`/partner-portal/${A}`);
    expect(homePath({ kind: "choose-partner", partnerIds: [A, B], path: "/partner-portal" })).toBe("/partner-portal");
    expect(homePath({ kind: "customer" })).toBeNull();
    expect(homePath({ kind: "no-access" })).toBeNull();
  });
});

describe("homeForSession", () => {
  it("is / for staff", () => expect(homeForSession({ kind: "staff", partnerIds: [] })).toBe("/"));
  it("is the portal for one workshop", () =>
    expect(homeForSession({ kind: "partner", partnerIds: [A] })).toBe(`/partner-portal/${A}`));
  it("is the chooser for several", () =>
    expect(homeForSession({ kind: "partner", partnerIds: [A, B] })).toBe("/partner-portal"));
});
