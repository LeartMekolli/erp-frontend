import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/**
 * erp-api's error body (`application/problem+json`, RFC 9457), matching
 * `ApiError` in erp-api `src/common/errors/api-error.ts`. Kept by hand because
 * the generated `Problem` schema lacks `code` (see `backend-todos.md`).
 * Branch on `type` and `code`, never on message text.
 */
export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { path: string; message: string }[];
  code?: string;
}

export function isApiProblem(value: unknown): value is ApiProblem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string" && typeof v.title === "string" && typeof v.status === "number";
}

/**
 * The problem in openapi-fetch's `error` (which has already read the body),
 * or a plain stand-in when the body wasn't one.
 */
export function problemFrom(error: unknown, response: Response): ApiProblem {
  return isApiProblem(error) ? error : { type: "about:blank", title: response.statusText, status: response.status };
}

/** Reads any failed response as a problem; bodies that aren't one get a plain stand-in. */
export async function readProblem(response: Response): Promise<ApiProblem> {
  const fallback: ApiProblem = {
    type: "about:blank",
    title: response.statusText,
    status: response.status,
  };
  if (!response.headers.get("content-type")?.includes("json")) return fallback;
  try {
    const body: unknown = await response.json();
    return isApiProblem(body) ? body : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Puts each error whose `path` names one of `fields` on that form field.
 * Returns what's left to show above the form, or null when nothing is.
 */
export function applyFieldErrors<T extends FieldValues>(
  problem: ApiProblem,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!problem.errors?.length) return problem.detail ?? null;

  const rest: string[] = [];
  for (const error of problem.errors) {
    const field = fields.find((f) => f === error.path);
    if (field) setError(field, { type: "server", message: error.message });
    else rest.push(error.message);
  }
  return rest.length ? rest.join(" ") : null;
}
