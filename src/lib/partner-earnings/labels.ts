import type { OwedJob, PartnerOwed, PayoutStatus } from "@/lib/api/schema-types";
import { formatMoney, signOf } from "@/lib/format/money";
import { type PayFact, payFacts } from "@/lib/payouts/pay-facts";

export { signOf };

const withoutSign = (amount: string) => amount.replace(/^-/, "");

/** What the next payout would pay. erp-api doesn't clamp it, so it agrees with Pay; nothing to pay shows as zero. */
export function owedNow(owed: Pick<PartnerOwed, "due_total" | "currency">): string {
  return formatMoney(signOf(owed.due_total) === 1 ? owed.due_total : "0", owed.currency);
}

export function jobsCount(n: number): string {
  return `${n} ${n === 1 ? "job" : "jobs"}`;
}

export const PAYOUT_STATUS: Record<PayoutStatus, string> = {
  pending: "On its way",
  paid: "Paid",
  failed: "Failed. Owed to you again",
  reversed: "Reversed. Owed to you again",
};

const LOST: Record<Extract<PayFact, { kind: "lost" }>["lost"], string> = { taken_back: "Taken back", cancelled: "Cancelled" };

/** The partner's word for one fact about where a job's pay stands. */
function partnerWord(fact: PayFact, currency: string): string {
  switch (fact.kind) {
    case "lost":
      return fact.nothingOwed ? `${LOST[fact.lost]}, nothing owed` : LOST[fact.lost];
    case "making":
      return "Still being made";
    case "making_overpaid":
      return `${formatMoney(fact.amount, currency)} taken off your next payout`;
    case "overpaid":
      return "Taken off your next payout";
    case "owed":
      return "Owed";
    case "partly_paid":
      return "Partly paid";
    case "paid":
      return "Paid";
  }
}

/** A row's words on the Jobs tab, in order; a job the partner lost says so first. */
export function owedJobWords(job: OwedJob, currency: string): string[] {
  return payFacts(job).map((fact) => partnerWord(fact, currency));
}

/** What a payout paid for one job; negative when it takes back an earlier overpayment. */
export function payoutJobAmount(amount: string, currency: string): string {
  return signOf(amount) === -1 ? `Taken back: ${formatMoney(withoutSign(amount), currency)}` : formatMoney(amount, currency);
}
