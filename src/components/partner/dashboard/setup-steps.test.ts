import { describe, expect, it } from "vitest";

import { createPartnerDashboardStore } from "../../../../test/fake-erp-api/partner-dashboard";
import { LAYERLINE_ID, NORTHCAST_ID } from "../../../../test/fake-erp-api/seed";

import { setupSteps } from "./setup-steps";

const store = createPartnerDashboardStore(Date.now);
const APPROVED = { status: "approved", submittedAt: null } as const;
const SETTING_UP = { status: "setting_up", submittedAt: null } as const;
const SUBMITTED = { status: "setting_up", submittedAt: "2026-11-26T09:00:00.000Z" } as const;

const step = (steps: ReturnType<typeof setupSteps>, key: string) => steps.find((one) => one.key === key);

describe("setupSteps", () => {
  it("lists what a workshop does before it gets offers, in order", () => {
    expect(setupSteps(store.setup(NORTHCAST_ID), APPROVED, "ready")).toEqual([
      { key: "capabilities", label: "Steps you can do", done: true },
      { key: "offerings", label: "Option values you offer", done: true },
      { key: "payout_account", label: "Payout account", done: true },
      { key: "submitted", label: "Submit for approval", done: true },
      { key: "approved", label: "Approved by staff", done: true, waiting: false },
    ]);
  });

  it("isn't done offering option values when there are none", () => {
    const steps = setupSteps(store.setup(LAYERLINE_ID), APPROVED, "ready");
    expect(step(steps, "offerings")?.done).toBe(false);
    expect(step(steps, "capabilities")?.done).toBe(true);
  });

  it("leaves out the payout account for someone who can't read it", () => {
    expect(setupSteps(store.setup(NORTHCAST_ID), APPROVED, null).map((one) => one.key)).toEqual(["capabilities", "offerings", "submitted", "approved"]);
  });

  it("isn't done with the account until it's ready, or with approval until staff approve", () => {
    const steps = setupSteps(store.setup(NORTHCAST_ID), SETTING_UP, "not_connected");
    expect(step(steps, "payout_account")?.done).toBe(false);
    expect(step(steps, "approved")?.done).toBe(false);
  });

  it("still has submitting to do, with approval not yet waiting", () => {
    const steps = setupSteps(store.setup(NORTHCAST_ID), SETTING_UP, "ready");
    expect(step(steps, "submitted")).toMatchObject({ label: "Submit for approval", done: false });
    expect(step(steps, "approved")).toMatchObject({ done: false, waiting: false });
  });

  it("waits for staff once submitted", () => {
    const steps = setupSteps(store.setup(NORTHCAST_ID), SUBMITTED, "ready");
    expect(step(steps, "submitted")?.done).toBe(true);
    expect(step(steps, "approved")).toMatchObject({ done: false, waiting: true });
  });

  it("counts an approved workshop as submitted, even if it never pressed Submit", () => {
    const steps = setupSteps(store.setup(NORTHCAST_ID), APPROVED, "ready");
    expect(step(steps, "submitted")?.done).toBe(true);
  });
});
