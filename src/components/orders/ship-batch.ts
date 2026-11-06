import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { api } from "@/lib/api/client";
import { idempotent, newIdempotencyKey } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { ShipBody } from "@/lib/api/schema-types";
import { OfflineError } from "@/lib/session/client-session";

export type BatchResult =
  | { id: string; number: number; ok: true; labelUrl: string | null }
  | { id: string; number: number; ok: false; message: string };

interface BatchOrder {
  id: string;
  number: number;
}

/**
 * Ships several orders, one `POST /orders/{id}/ship` each since erp-api has
 * no bulk route (`backend-todos.md`), `concurrency` at a time. Each order's
 * `Idempotency-Key` is kept in `keys`, so a retry of a failed order replays
 * rather than ships twice. Once `signal` aborts no new request starts; those
 * in flight finish. Results come back in the orders' order.
 */
export async function shipBatch(
  orders: readonly BatchOrder[],
  body: ShipBody,
  options: { concurrency: number; keys: Map<string, string>; signal: AbortSignal; onResult: (result: BatchResult) => void },
): Promise<BatchResult[]> {
  const { concurrency, keys, signal, onResult } = options;
  const results: (BatchResult | undefined)[] = [];
  let next = 0;

  async function worker() {
    while (!signal.aborted && next < orders.length) {
      const index = next++;
      const order = orders[index]!;
      let key = keys.get(order.id);
      if (!key) {
        key = newIdempotencyKey();
        keys.set(order.id, key);
      }
      const result = await shipOne(order, body, key);
      results[index] = result;
      onResult(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, orders.length) }, worker));
  return results.filter((result) => result !== undefined);
}

async function shipOne({ id, number }: BatchOrder, body: ShipBody, key: string): Promise<BatchResult> {
  try {
    const { data, error, response } = await api.POST("/orders/{id}/ship", {
      params: { path: { id } },
      body,
      ...idempotent(key),
    });
    if (data) return { id, number, ok: true, labelUrl: data.shipping.label?.url ?? null };
    const problem = problemFrom(error, response);
    return { id, number, ok: false, message: problem.detail || problem.title || UNKNOWN };
  } catch (error) {
    return { id, number, ok: false, message: error instanceof OfflineError ? noAnswer() : UNKNOWN };
  }
}
