import type { OwedJob } from "@/lib/api/schema-types";
import { signOf } from "@/lib/format/money";

/** Where a job's pay stands, as a fact. Staff and partners word the same facts differently. */
export type PayFact =
  | { kind: "lost"; lost: "taken_back" | "cancelled"; nothingOwed: boolean }
  | { kind: "making" }
  | { kind: "making_overpaid"; amount: string }
  | { kind: "overpaid" }
  | { kind: "owed" }
  | { kind: "partly_paid" }
  | { kind: "paid" };

/** Where a job's pay stands, from its state and numbers: `paid` counts a payout still on its way. A job lost says so first. */
export function payFacts(job: Pick<OwedJob, "state" | "holding" | "amount" | "paid" | "due">): PayFact[] {
  if (job.holding === "with_you") return payStands(job);
  const lost = { kind: "lost", lost: job.holding, nothingOwed: signOf(job.amount) === 0 } as const;
  return lost.nothingOwed ? [lost] : [lost, ...payStands(job)];
}

function payStands(job: Pick<OwedJob, "state" | "paid" | "due">): PayFact[] {
  const due = signOf(job.due);
  if (job.state === "not_yet") {
    return due === -1 ? [{ kind: "making" }, { kind: "making_overpaid", amount: job.due.replace(/^-/, "") }] : [{ kind: "making" }];
  }
  if (due === -1) return [{ kind: "overpaid" }];
  if (due === 1) return [{ kind: signOf(job.paid) === 1 ? "partly_paid" : "owed" }];
  return [{ kind: "paid" }];
}
