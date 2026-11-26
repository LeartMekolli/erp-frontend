import { noAnswer, UNKNOWN } from "@/components/auth/copy";
import { isApiProblem } from "@/lib/api/problem";
import { OfflineError } from "@/lib/session/client-session";

/** What a refused Save shows: erp-api's errors on the form's fields, and anything else above them. */
export interface SaveErrors {
  fields: Record<string, string>;
  message: string | null;
}

/**
 * Sorts a failed save's error onto the form: each erp-api error whose `path` the form knows goes to its
 * field (`toField` maps "shipping_address.city" to the form's name for it, or null), the rest above.
 */
export function saveErrors(error: unknown, toField: (path: string) => string | null): SaveErrors {
  if (error instanceof OfflineError) return { fields: {}, message: noAnswer() };
  if (!isApiProblem(error)) return { fields: {}, message: UNKNOWN };
  const fields: Record<string, string> = {};
  const rest: string[] = [];
  for (const entry of error.errors ?? []) {
    const field = toField(entry.path);
    if (field && !(field in fields)) fields[field] = entry.message;
    else if (!field) rest.push(entry.message);
  }
  if (error.errors?.length) return { fields, message: rest.length ? rest.join(" ") : null };
  return { fields, message: error.detail ?? UNKNOWN };
}
