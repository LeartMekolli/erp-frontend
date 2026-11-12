/**
 * erp-api replays a POST sent again with the same key and body, so a retried
 * or double-clicked submit never acts twice (erp-api
 * `src/modules/idempotency/idempotency.interceptor.ts`).
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** The typed header parameter: `api.POST('/orders', { body, params: { header: idempotencyHeader(key) } })`. */
export function idempotencyHeader(key: string): { "Idempotency-Key": string } {
  return { "Idempotency-Key": key };
}
