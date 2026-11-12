import { describe, expect, it } from "vitest";

import { idempotencyHeader, newIdempotencyKey } from "./idempotency";

describe("idempotency keys", () => {
  it("makes keys erp-api accepts, a new one each time", () => {
    const key = newIdempotencyKey();
    // erp-api's rule: 1–255 visible ASCII characters (idempotency.interceptor.ts:18).
    expect(key).toMatch(/^[\x21-\x7e]{1,255}$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });

  it("puts the key in the typed header parameter erp-api declares", () => {
    expect(idempotencyHeader("k1")).toEqual({ "Idempotency-Key": "k1" });
  });
});
