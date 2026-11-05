import { describe, expect, it } from "vitest";

import { IDEMPOTENCY_HEADER, idempotent, newIdempotencyKey } from "./idempotency";

describe("idempotency keys", () => {
  it("makes keys erp-api accepts, a new one each time", () => {
    const key = newIdempotencyKey();
    // erp-api's rule: 1–255 visible ASCII characters (idempotency.interceptor.ts:18).
    expect(key).toMatch(/^[\x21-\x7e]{1,255}$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });

  it("puts the key in the header openapi-fetch sends", () => {
    expect(IDEMPOTENCY_HEADER).toBe("Idempotency-Key");
    expect(idempotent("k1")).toEqual({ headers: { "Idempotency-Key": "k1" } });
  });
});
