import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { isApiProblem } from "@/lib/api/problem";
import { OfflineError } from "@/lib/session/client-session";

/** How many of a refusal's reasons to name: a move can hold a thousand pieces. */
const NAMED_REASONS = 3;

/** What to show when a submit fails: erp-api's refusal with its first few reasons. */
export function submitErrorText(error: unknown): string {
  if (error instanceof OfflineError) return noAnswer();
  if (!isApiProblem(error)) return UNKNOWN;
  return [error.detail, ...(error.errors ?? []).slice(0, NAMED_REASONS).map((e) => e.message)].filter(Boolean).join(" ") || UNKNOWN;
}
