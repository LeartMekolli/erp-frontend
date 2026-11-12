import { UNKNOWN } from "@/components/auth/copy";

/**
 * What to tell staff when erp-api refuses to ship order `number`, by its
 * `code` (erp-api `orders.service.ts:252`, `courier-account.service.ts:22`,
 * `shipments.service.ts:32`), and whether the list is now stale: the order
 * moved on since it was shown.
 */
export function shipRefusal(problem: { code?: string | null; detail?: string }, number: number): { message: string; stale: boolean } {
  switch (problem.code) {
    case "order_already_shipped":
      return { message: `#${number} is already shipped.`, stale: true };
    case "order_not_ready":
      return { message: `#${number} isn't ready to ship any more.`, stale: true };
    case "courier_account_missing":
      return { message: "No courier service is set up for labels.", stale: false };
    case "label_in_progress":
      return { message: `A label for #${number} is already being bought. Wait a moment, then check the order.`, stale: false };
    default:
      return { message: problem.detail || UNKNOWN, stale: false };
  }
}
