import type { HoldReason } from "@/lib/api/schema-types";

/** What a line or a piece says while erp-api holds it, so nobody can move it yet. */
export const HOLD_WORDS: Record<HoldReason, string> = {
  waiting_for_payment: "Waiting for payment",
  waiting_for_parts: "Waiting for its parts",
};
