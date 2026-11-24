import { describe, expect, it } from "vitest";

import { createPartnerDashboardStore } from "../../../../test/fake-erp-api/partner-dashboard";
import { LAYERLINE_ID, NORTHCAST_ID } from "../../../../test/fake-erp-api/seed";

import { setupSteps } from "./setup-steps";

const store = createPartnerDashboardStore(Date.now);

describe("setupSteps", () => {
  it("lists what a workshop does before it gets offers, in order", () => {
    expect(setupSteps(store.setup(NORTHCAST_ID), "approved", "ready")).toEqual([
      { key: "capabilities", label: "Steps you can do", done: true },
      { key: "offerings", label: "Option values you offer", done: true },
      { key: "payout_account", label: "Payout account", done: true },
      { key: "approved", label: "Approved by staff", done: true },
    ]);
  });

  it("isn't done offering option values when there are none", () => {
    const steps = setupSteps(store.setup(LAYERLINE_ID), "approved", "ready");
    expect(steps.find((step) => step.key === "offerings")?.done).toBe(false);
    expect(steps.find((step) => step.key === "capabilities")?.done).toBe(true);
  });

  it("leaves out the payout account for someone who can't read it", () => {
    expect(setupSteps(store.setup(NORTHCAST_ID), "approved", null).map((step) => step.key)).toEqual(["capabilities", "offerings", "approved"]);
  });

  it("isn't done with the account until it's ready, or with approval until staff approve", () => {
    const steps = setupSteps(store.setup(NORTHCAST_ID), "setting_up", "not_connected");
    expect(steps.find((step) => step.key === "payout_account")?.done).toBe(false);
    expect(steps.find((step) => step.key === "approved")?.done).toBe(false);
  });
});
