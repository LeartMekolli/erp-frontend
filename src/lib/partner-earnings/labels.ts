import type { OwedJob, PartnerOwed, PayoutStatus } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";

/** erp-api's money: a plain decimal string (ADR 0002). */
const AMOUNT = /^-?\d+(\.\d+)?$/;

/** An amount's sign, read from the string so no digit passes through a float. `-0.00` is 0. */
export function signOf(amount: string): -1 | 0 | 1 {
  if (!AMOUNT.test(amount)) throw new Error(`Not a money amount: ${JSON.stringify(amount)}`);
  if (!/[1-9]/.test(amount)) return 0;
  return amount.startsWith("-") ? -1 : 1;
}

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

const LOST: Record<Exclude<OwedJob["holding"], "with_you">, string> = { taken_back: "Taken back", cancelled: "Cancelled" };

/** Where a job's pay stands, from its state and numbers: `paid` counts a payout still on its way. */
function payWords(job: OwedJob, currency: string): string[] {
  const due = signOf(job.due);
  if (job.state === "not_yet") {
    return due === -1 ? ["Still being made", `${formatMoney(withoutSign(job.due), currency)} taken off your next payout`] : ["Still being made"];
  }
  if (due === -1) return ["Taken off your next payout"];
  if (due === 1) return [signOf(job.paid) === 1 ? "Partly paid" : "Owed"];
  return ["Paid"];
}

/** A row's words on the Jobs tab, in order; a job the partner lost says so first. */
export function owedJobWords(job: OwedJob, currency: string): string[] {
  if (job.holding === "with_you") return payWords(job, currency);
  const lost = LOST[job.holding];
  return signOf(job.amount) === 0 ? [`${lost}, nothing owed`] : [lost, ...payWords(job, currency)];
}

/** What a payout paid for one job; negative when it takes back an earlier overpayment. */
export function payoutJobAmount(amount: string, currency: string): string {
  return signOf(amount) === -1 ? `Taken back: ${formatMoney(withoutSign(amount), currency)}` : formatMoney(amount, currency);
}
