import type { PartnerSetup, PartnerStatus, PayoutAccountState } from "@/lib/api/schema-types";

export interface SetupStep {
  key: "capabilities" | "offerings" | "payout_account" | "submitted" | "approved";
  label: string;
  done: boolean;
  /** Approval only: submitted, and staff haven't decided yet. */
  waiting?: boolean;
}

/**
 * What a workshop sets up before it gets offers, in order. erp-api offers a job only to a partner that
 * can do its steps and offers each of its option values (`eligibility.ts:104`). The payout account is left
 * out when `account` is null: only admins and owners may read it. Submitting is done once the owner sent
 * the setup (`submitted_at`), or once staff approved, which they may do without a submission.
 */
export function setupSteps(
  setup: PartnerSetup,
  partner: { status: PartnerStatus; submittedAt: string | null },
  account: PayoutAccountState | null,
): SetupStep[] {
  const approved = partner.status === "approved";
  const submitted = partner.submittedAt !== null || approved;
  const steps: SetupStep[] = [
    { key: "capabilities", label: "Steps you can do", done: setup.capabilities.length > 0 },
    { key: "offerings", label: "Option values you offer", done: setup.offerings.length > 0 },
  ];
  if (account !== null) steps.push({ key: "payout_account", label: "Payout account", done: account === "ready" });
  steps.push({ key: "submitted", label: "Submit for approval", done: submitted });
  steps.push({ key: "approved", label: "Approved by staff", done: approved, waiting: submitted && !approved });
  return steps;
}
