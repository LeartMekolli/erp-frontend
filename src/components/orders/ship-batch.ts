import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { api } from "@/lib/api/client";
import { idempotencyHeader, newIdempotencyKey } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { ShipBody } from "@/lib/api/schema-types";
import { STILL_WORKING } from "@/lib/query/use-api-mutation";
import { OfflineError } from "@/lib/session/client-session";

import { shipRefusal } from "./ship-refusal";

/** The most orders one `POST /orders/ship` takes (erp-api `orders.service.ts:227`). */
export const SHIP_PER_REQUEST = 25;

export interface BatchOrder {
  id: string;
  number: number;
}

/** One request's orders and its `Idempotency-Key`. */
export interface Chunk {
  orders: readonly BatchOrder[];
  key: string;
}

export type BatchResult =
  | { id: string; number: number; ok: true; labelUrl: string | null }
  | { id: string; number: number; ok: false; message: string; stale: boolean };

/**
 * What one request came to. Answered: a result for each of its orders.
 * Unanswered: it may or may not have shipped them, so it goes again as the
 * same request with the same key, and erp-api replays it if it did.
 */
export type ChunkOutcome =
  | { chunk: Chunk; answered: true; results: BatchResult[] }
  | { chunk: Chunk; answered: false; message: string };

/** Splits orders into requests of at most 25, each with a new key. */
export function chunksOf(orders: readonly BatchOrder[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (let start = 0; start < orders.length; start += SHIP_PER_REQUEST) {
    chunks.push({ orders: orders.slice(start, start + SHIP_PER_REQUEST), key: newIdempotencyKey() });
  }
  return chunks;
}

/**
 * Ships the chunks one request at a time (erp-api ships 5 of each at once),
 * with the same options for every order. Once `signal` aborts no new request
 * starts; the one in flight finishes.
 */
export async function shipChunks(
  chunks: readonly Chunk[],
  body: ShipBody,
  options: { signal: AbortSignal; onChunk: (outcome: ChunkOutcome) => void },
): Promise<void> {
  for (const chunk of chunks) {
    if (options.signal.aborted) return;
    options.onChunk(await shipChunk(chunk, body));
  }
}

async function shipChunk(chunk: Chunk, body: ShipBody): Promise<ChunkOutcome> {
  try {
    const { data, error, response } = await api.POST("/orders/ship", {
      params: { header: idempotencyHeader(chunk.key) },
      body: { orders: chunk.orders.map(({ id }) => ({ order_id: id, ...body })) },
    });
    if (data) {
      const numbers = new Map(chunk.orders.map((order) => [order.id, order.number]));
      const results = data.results.map((result): BatchResult => {
        const number = numbers.get(result.order_id) ?? 0;
        if (result.result === "shipped") return { id: result.order_id, number, ok: true, labelUrl: result.order.shipping.label?.url ?? null };
        return { id: result.order_id, number, ok: false, ...shipRefusal(result.error, number) };
      });
      return { chunk, answered: true, results };
    }
    const problem = problemFrom(error, response);
    if (problem.code === "idempotency_in_progress") return { chunk, answered: false, message: STILL_WORKING };
    if (problem.status >= 500) return { chunk, answered: false, message: problem.detail || UNKNOWN };
    // Refused as a whole, so nothing shipped: each order can go again in a new request.
    const message = problem.detail || problem.title || UNKNOWN;
    return { chunk, answered: true, results: chunk.orders.map(({ id, number }) => ({ id, number, ok: false, message, stale: false })) };
  } catch (error) {
    return { chunk, answered: false, message: error instanceof OfflineError ? noAnswer() : UNKNOWN };
  }
}
