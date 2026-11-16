import { describe, expect, it } from "vitest";

import type { MeResponse } from "@/lib/api/schema-types";

import { STAFF } from "../../../test/fake-erp-api/seed";
import { createFakeState } from "../../../test/fake-erp-api/state";

import { can, canPlaceOrders, partnerRoleAtLeast } from "./permissions";

const staffMe = (permissions: MeResponse["permissions"]): MeResponse => ({
  ...createFakeState().me(STAFF),
  permissions,
});

describe("can", () => {
  it("lets staff do what their permissions say", () => {
    expect(can(staffMe(["order.read"]), "order.read")).toBe(true);
    expect(can(staffMe(["order.read"]), "order.write")).toBe(false);
  });

  it("never lets a partner or customer through, whatever the list says", () => {
    expect(can({ ...staffMe(["order.read"]), kind: "partner" }, "order.read")).toBe(false);
    expect(can({ ...staffMe(["order.read"]), kind: "customer" }, "order.read")).toBe(false);
  });

  it("says no while /me loads", () => {
    expect(can(undefined, "order.read")).toBe(false);
  });
});

describe("canPlaceOrders", () => {
  const all = ["order.write", "quote.create", "customer.read", "catalog.read"] as const;

  it("needs all four permissions", () => {
    expect(canPlaceOrders(staffMe([...all]))).toBe(true);
    for (const missing of all) {
      expect(canPlaceOrders(staffMe(all.filter((permission) => permission !== missing)))).toBe(false);
    }
    expect(canPlaceOrders(undefined)).toBe(false);
  });
});

describe("partnerRoleAtLeast", () => {
  it.each([
    ["member", "admin", false],
    ["admin", "admin", true],
    ["owner", "member", true],
    ["member", "member", true],
    ["admin", "owner", false],
  ] as const)("%s at least %s is %s", (role, required, ok) => {
    expect(partnerRoleAtLeast(role, required)).toBe(ok);
  });
});
