import { describe, expect, it } from "vitest";

import type { MeResponse } from "@/lib/api/schema-types";

import { STAFF } from "../../../test/fake-erp-api/seed";
import { createFakeState } from "../../../test/fake-erp-api/state";

import { firstAllowedHref, navAllows, visibleNav } from "./nav";

const staffMe = (permissions: MeResponse["permissions"]): MeResponse => ({
  ...createFakeState().me(STAFF),
  permissions,
});

describe("staff navigation", () => {
  it("shows each link only with its permission", () => {
    expect(visibleNav(staffMe(["order.read"])).map((link) => link.label)).toEqual(["Orders", "Claims"]);
    expect(visibleNav(staffMe(["order.read", "pricing.read"])).map((link) => link.group)).toEqual(["work", "work", "setup"]);
  });

  it("shows Settings with any settings-type permission", () => {
    for (const permission of ["settings.read", "user.read", "role.read", "template.read"] as const) {
      expect(visibleNav(staffMe([permission])).map((link) => link.label)).toEqual(["Settings"]);
    }
  });

  it("sends staff to Orders first, else the first link they may see", () => {
    expect(firstAllowedHref(staffMe(["catalog.read", "order.read"]))).toBe("/orders");
    expect(firstAllowedHref(staffMe(["catalog.read"]))).toBe("/catalog");
    expect(firstAllowedHref(staffMe(["file.read"]))).toBeNull();
  });

  it("allows a section by the same rule as its link", () => {
    const me = staffMe(["order.read"]);
    expect(navAllows(me, "claims")).toBe(true);
    expect(navAllows(me, "pricing")).toBe(false);
    expect(navAllows(me, "help")).toBe(true);
    expect(navAllows(me, "nowhere")).toBe(false);
  });
});
