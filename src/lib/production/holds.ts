import type { HoldReason } from "@/lib/api/schema-types";

/** What a line or a piece says while erp-api holds it, so nobody can move it yet. */
export const HOLD_WORDS: Record<HoldReason, string> = {
  waiting_for_payment: "Waiting for payment",
  waiting_for_parts: "Waiting for its parts",
};

/**
 * Why someone can't move a piece or line they may otherwise move: the skill its step requires, as erp-api names
 * it (`missing_skill`), so they know whom to ask. Plain words when erp-api names none.
 */
export function skillWords(missing: { name: string } | null): string {
  return missing ? `Needs the ${missing.name} skill` : "Needs a skill you don't have";
}
