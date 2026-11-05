import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { OfflineError } from "@/lib/session/client-session";

import { isApiProblem } from "./problem";

/** What to tell the person when a request failed: no answer, erp-api's own detail, or a plain fallback. */
export function errorMessage(error: unknown): string {
  if (error instanceof OfflineError) return noAnswer();
  return (isApiProblem(error) && error.detail) || UNKNOWN;
}
