/**
 * erp-api replays a POST sent again with the same key and body, so a retried
 * or double-clicked submit never acts twice (erp-api
 * `src/modules/idempotency/idempotency.interceptor.ts`). Not a declared header
 * in the OpenAPI document yet (`backend-todos.md`), so it goes in `headers`.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Spread into an openapi-fetch call: `api.POST('/orders', { body, ...idempotent(key) })`. */
export function idempotent(key: string): { headers: Record<string, string> } {
  return { headers: { [IDEMPOTENCY_HEADER]: key } };
}
