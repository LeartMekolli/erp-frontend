import type { PartnerSetup, PartnerStatus, PayoutAccountState } from "@/lib/api/schema-types";

export interface SetupStep {
  key: "capabilities" | "offerings" | "payout_account" | "approved";
  label: string;
  done: boolean;
}

/**
 * What a workshop sets up before it gets offers, in order. erp-api offers a job only to a partner that
 * can do its steps and offers each of its option values (`eligibility.ts:104`). The payout account is left
 * out when `account` is null: only admins and owners may read it. There is no "Submit for approval" step:
 * erp-api doesn't tell the partner whether it has submitted (`backend-todos.md`).
 */
export function setupSteps(setup: PartnerSetup, status: PartnerStatus, account: PayoutAccountState | null): SetupStep[] {
  const steps: SetupStep[] = [
    { key: "capabilities", label: "Steps you can do", done: setup.capabilities.length > 0 },
    { key: "offerings", label: "Option values you offer", done: setup.offerings.length > 0 },
  ];
  if (account !== null) steps.push({ key: "payout_account", label: "Payout account", done: account === "ready" });
  steps.push({ key: "approved", label: "Approved by staff", done: status === "approved" });
  return steps;
}
