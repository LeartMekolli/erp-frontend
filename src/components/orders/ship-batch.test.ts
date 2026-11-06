import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/schema-types";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { signInAs } from "../../../test/render";

import { shipBatch, type BatchResult } from "./ship-batch";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;
const pick = (...numbers: number[]) => numbers.map((number) => ({ id: order(number).id, number }));

/** Each ship request as it starts: the order's id and its Idempotency-Key. */
let requests: { id: string; key: string | null }[] = [];
beforeEach(() => {
  signInAs(STAFF);
  requests = [];
  server.events.on("request:start", ({ request }) => {
    const match = /\/orders\/([^/]+)\/ship$/.exec(new URL(request.url).pathname);
    if (match) requests.push({ id: match[1]!, key: request.headers.get("idempotency-key") });
  });
});
afterEach(() => server.events.removeAllListeners());

/** Ships every order after a short wait, counting how many are in flight at once. */
function serveSlowly() {
  const seen = { inFlight: 0, most: 0 };
  server.use(
    http.post(`${FAKE_API_URL}/orders/:id/ship`, async () => {
      seen.inFlight += 1;
      seen.most = Math.max(seen.most, seen.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      seen.inFlight -= 1;
      return HttpResponse.json({ shipping: { label: null } });
    }),
  );
  return seen;
}

const fakeOrders = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `order-${i}`, number: 2000 + i }));

describe("shipBatch", () => {
  it("runs at most 3 at once", async () => {
    const seen = serveSlowly();
    const reported: BatchResult[] = [];
    const results = await shipBatch(fakeOrders(7), {}, {
      concurrency: 3,
      keys: new Map(),
      signal: new AbortController().signal,
      onResult: (result) => reported.push(result),
    });

    expect(seen.most).toBe(3);
    expect(results).toHaveLength(7);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(reported).toHaveLength(7);
    // One key per order.
    expect(new Set(requests.map((r) => r.key)).size).toBe(7);
  });

  it("retries only failed orders with their first keys", async () => {
    const failing = order(1043).id;
    fakeState().orders.failNextLabel(failing);
    const keys = new Map<string, string>();
    const options = { concurrency: 3, keys, signal: new AbortController().signal, onResult: () => {} };

    const first = await shipBatch(pick(1042, 1043, 1044), { label: {} }, options);
    const failed = first.filter((r) => !r.ok);
    expect(failed).toEqual([
      { id: failing, number: 1043, ok: false, message: "The courier service refused the label: address incomplete" },
    ]);
    expect(first.find((r) => r.number === 1042)).toMatchObject({ ok: true, labelUrl: "https://labels.example.test/1042.pdf" });
    const firstKey = requests.find((r) => r.id === failing)!.key;

    requests = [];
    const second = await shipBatch(failed, { label: {} }, options);
    expect(second).toEqual([{ id: failing, number: 1043, ok: true, labelUrl: "https://labels.example.test/1043.pdf" }]);
    expect(requests).toEqual([{ id: failing, key: firstKey }]);
    expect(order(1043).state).toBe("shipped");
  });

  it("stops starting new requests when aborted", async () => {
    serveSlowly();
    const controller = new AbortController();
    const results = await shipBatch(fakeOrders(7), {}, {
      concurrency: 3,
      keys: new Map(),
      signal: controller.signal,
      onResult: () => controller.abort(),
    });

    // The three in flight finish; nothing new starts.
    expect(requests).toHaveLength(3);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
