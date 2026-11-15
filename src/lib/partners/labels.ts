import type { JobOrder, PartnerStatus, PayoutAccountState, PayoutStatus, StaffOwedJob } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";
import { type PayFact, payFacts } from "@/lib/payouts/pay-facts";

export const PARTNER_STATUS: Record<PartnerStatus, string> = {
  setting_up: "Setting up",
  approved: "Approved",
  suspended: "Suspended",
};

export const PAYOUT_ACCOUNT: Record<PayoutAccountState, string> = {
  ready: "Payouts ready",
  not_connected: "Payouts not set up",
  onboarding: "Setting up payouts",
  restricted: "The payment provider needs more from this partner",
};

export const STAFF_PAYOUT_STATUS: Record<PayoutStatus, string> = {
  pending: "On its way",
  paid: "Paid",
  failed: "Failed. Owed again",
  reversed: "Reversed. Owed again",
};

const LOST: Record<Extract<PayFact, { kind: "lost" }>["lost"], string> = { taken_back: "Taken back", cancelled: "Cancelled" };

/** Staff's word for one fact about where a job's pay stands. */
function staffWord(fact: PayFact, currency: string): string {
  switch (fact.kind) {
    case "lost":
      return fact.nothingOwed ? `${LOST[fact.lost]}, nothing owed` : LOST[fact.lost];
    case "making":
      return "Still being made";
    case "making_overpaid":
      return `${formatMoney(fact.amount, currency)} comes off the next payout`;
    case "overpaid":
      return "Overpaid, comes off the next payout";
    case "owed":
      return "Owed";
    case "partly_paid":
      return "Partly paid";
    case "paid":
      return "Paid";
  }
}

/** A row's words on the staff Jobs tab, in order; a job the partner lost says so first. */
export function staffOwedJobWords(job: StaffOwedJob, currency: string): string[] {
  return payFacts(job).map((fact) => staffWord(fact, currency));
}

/** The order and line a job is from, as `Order #1042 · line 2`. `line_position` counts from 0. */
export function orderRef(order: JobOrder): string {
  return `Order #${order.number} · line ${order.line_position + 1}`;
}
