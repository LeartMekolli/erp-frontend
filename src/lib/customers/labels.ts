import type { Customer } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";

export const STATUS_LABEL: Record<Customer["status"], string> = {
  active: "Active",
  disabled: "Disabled",
};

/** How a customer pays: "Pay first", or "Pay later · 30 days". */
export function termsText(terms: Customer["payment_terms"]): string {
  if (terms.terms === "pay_first") return "Pay first";
  return `Pay later · ${terms.days_to_pay} ${terms.days_to_pay === 1 ? "day" : "days"}`;
}

/** What a pay-later customer may owe at once; erp-api's null means there's no limit. */
export function creditLimitText(limit: string | null, currency: string): string {
  return limit === null ? "No limit" : formatMoney(limit, currency);
}
