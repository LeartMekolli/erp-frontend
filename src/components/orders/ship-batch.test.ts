import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/schema-types";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { signInAs } from "../../../test/render";

import { chunksOf, SHIP_PER_REQUEST, shipChunks, type ChunkOutcome } from "./ship-batch";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;
const pick = (...numbers: number[]) => numbers.map((number) => ({ id: order(number).id, number }));

/** Each bulk ship request as it starts: its order ids and its Idempotency-Key. */
let requests: { ids: string[]; key: string | null }[] = [];
beforeEach(() => {
  signInAs(STAFF);
  requests = [];
  server.events.on("request:start", ({ request }) => {
    if (!new URL(request.url).pathname.endsWith("/orders/ship")) return;
    const key = request.headers.get("idempotency-key");
    void request
      .clone()
      .json()
      .then((body: { orders: { order_id: string }[] }) => requests.push({ ids: body.orders.map((entry) => entry.order_id), key }));
  });
});
afterEach(() => server.events.removeAllListeners());

/** Ships every order it's sent, with no label. */
function serveAll() {
  server.use(
    http.post(`${FAKE_API_URL}/orders/ship`, async ({ request }) => {
      const body = (await request.json()) as { orders: { order_id: string }[] };
      return HttpResponse.json({
        results: body.orders.map((entry) => ({ order_id: entry.order_id, result: "shipped", order: { shipping: { label: null } } })),
      });
    }),
  );
}

const fakeOrders = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `order-${i}`, number: 2000 + i }));

async function ship(chunks: ReturnType<typeof chunksOf>, body = {}, signal = new AbortController().signal) {
  const outcomes: ChunkOutcome[] = [];
  await shipChunks(chunks, body, { signal, onChunk: (outcome) => outcomes.push(outcome) });
  return outcomes;
}

describe("chunksOf", () => {
  it("splits orders into requests of at most 25, each with its own key", () => {
    const chunks = chunksOf(fakeOrders(30));
    expect(SHIP_PER_REQUEST).toBe(25);
    expect(chunks.map((chunk) => chunk.orders.length)).toEqual([25, 5]);
    expect(chunks[0]!.key).not.toBe(chunks[1]!.key);
  });
});

describe("shipChunks", () => {
  it("ships 30 orders in two requests", async () => {
    serveAll();
    const outcomes = await ship(chunksOf(fakeOrders(30)));

    await expect.poll(() => requests.length).toBe(2);
    expect(requests.map((r) => r.ids.length)).toEqual([25, 5]);
    expect(outcomes.map((o) => o.answered && o.results.length)).toEqual([25, 5]);
    expect(outcomes.every((o) => o.answered && o.results.every((r) => r.ok))).toBe(true);
  });

  it("maps failed entries through shipRefusal", async () => {
    const outcomes = await ship(chunksOf(pick(1042, 1051)));

    expect(outcomes).toHaveLength(1);
    const outcome = outcomes[0]!;
    expect(outcome.answered).toBe(true);
    if (!outcome.answered) return;
    expect(outcome.results).toEqual([
      { id: order(1042).id, number: 1042, ok: true, labelUrl: null },
      { id: order(1051).id, number: 1051, ok: false, message: "#1051 is already shipped.", stale: true },
    ]);
  });

  it("gives each bought label's link", async () => {
    const outcomes = await ship(chunksOf(pick(1042)), { label: {} });
    expect(outcomes[0]).toMatchObject({ answered: true, results: [{ ok: true, labelUrl: "https://labels.example.test/1042.pdf" }] });
  });

  it("reports a request with no answer", async () => {
    server.use(http.post(`${FAKE_API_URL}/orders/ship`, () => HttpResponse.error(), { once: true }));
    const chunks = chunksOf(pick(1042, 1044));
    const outcomes = await ship(chunks);

    expect(outcomes).toEqual([{ chunk: chunks[0], answered: false, message: expect.any(String) as string }]);
    expect(order(1042).state).toBe("ready");
  });

  it("treats a request still in progress as unanswered", async () => {
    server.use(
      http.post(
        `${FAKE_API_URL}/orders/ship`,
        () =>
          HttpResponse.json(
            { type: "about:blank", title: "Conflict", status: 409, code: "idempotency_in_progress", detail: "A request with this key is in progress" },
            { status: 409, headers: { "content-type": "application/problem+json" } },
          ),
        { once: true },
      ),
    );
    const outcomes = await ship(chunksOf(pick(1042)));
    expect(outcomes).toEqual([expect.objectContaining({ answered: false, message: "Still working on it. Try again in a moment." })]);
  });

  it("stops after the request in flight when aborted", async () => {
    serveAll();
    const controller = new AbortController();
    const outcomes: ChunkOutcome[] = [];
    await shipChunks(chunksOf(fakeOrders(60)), {}, {
      signal: controller.signal,
      onChunk: (outcome) => {
        outcomes.push(outcome);
        controller.abort();
      },
    });

    expect(outcomes).toHaveLength(1);
    await expect.poll(() => requests.length).toBe(1);
  });
});
