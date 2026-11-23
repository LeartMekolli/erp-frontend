import type { AttentionGroup } from "@/lib/api/schema-types";

export type AttentionKind = AttentionGroup["kind"];

/** erp-api's order of the kinds (`attention.service.ts` `ATTENTION_KINDS`): the dashboard lists them so. */
export const ATTENTION_KINDS = [
  "order_at_risk",
  "job_overdue",
  "awaiting_payment",
  "credit_hold",
  "invoice_overdue",
  "subscription_past_due",
  "partner_near_capacity",
  "offer_unanswered",
  "defect_spike",
] as const satisfies readonly AttentionKind[];

/**
 * How each kind reads, its status dot, and the list it opens. The Orders list keeps its filters on the
 * page, not in the address (`use-orders-view.ts`), so order kinds open Orders on its default Needs you
 * tab; the other sections aren't built yet and open their placeholder.
 */
export const ATTENTION: Record<AttentionKind, { words: string; dot: "late" | "collect" | "violet" | "warn"; href: string }> = {
  order_at_risk: { words: "Orders at risk", dot: "late", href: "/orders" },
  job_overdue: { words: "Jobs past their due date", dot: "late", href: "/production" },
  awaiting_payment: { words: "Awaiting payment", dot: "collect", href: "/orders" },
  credit_hold: { words: "Customers on credit hold", dot: "warn", href: "/customers" },
  invoice_overdue: { words: "Invoices overdue", dot: "late", href: "/orders" },
  subscription_past_due: { words: "Plans past due", dot: "warn", href: "/customers" },
  partner_near_capacity: { words: "Partners near capacity", dot: "collect", href: "/partners" },
  offer_unanswered: { words: "Offers waiting for a partner", dot: "violet", href: "/partners" },
  defect_spike: { words: "Defects up at a step", dot: "late", href: "/production" },
};

/** The kinds with something in them, in erp-api's order. */
export function attentionRows(groups: readonly AttentionGroup[]): AttentionGroup[] {
  return ATTENTION_KINDS.flatMap((kind) => groups.filter((group) => group.kind === kind && group.total > 0));
}
