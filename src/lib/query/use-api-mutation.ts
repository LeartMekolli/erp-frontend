"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { useRef } from "react";

import { newIdempotencyKey } from "@/lib/api/idempotency";
import { isApiProblem } from "@/lib/api/problem";

/** erp-api is still running the first request with this key (`idempotency_in_progress`). */
export const STILL_WORKING = "Still working on it. Try again in a moment.";

/** Objects with sorted keys at every depth, so `{ a, b }` and `{ b, a }` are one input. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])]),
    );
  }
  return value;
}

interface Submission<TData> {
  input: string;
  key: string;
  running?: Promise<TData>;
}

/**
 * A submit to erp-api with one `Idempotency-Key` per submission: sending the
 * same input again after a failure reuses the key, so erp-api replays instead
 * of acting twice; other input, or anything after a success, gets a new key.
 * The same input while it's still running joins the running request.
 * erp-api's key refusals are handled here: `idempotency_in_progress` keeps the
 * key and says to wait; `idempotency_key_reused` is AMI's own bug, so it's
 * logged and sent once more with a new key.
 */
export function useApiMutation<TVars, TData>(
  mutate: (vars: TVars, key: string) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, unknown, TVars>, "mutationFn">,
) {
  const last = useRef<Submission<TData> | null>(null);

  return useMutation<TData, unknown, TVars>({
    ...options,
    mutationFn: (vars) => {
      const input = JSON.stringify(canonical(vars)) ?? "";
      let submission = last.current;
      if (submission?.input !== input) {
        submission = { input, key: newIdempotencyKey() };
        last.current = submission;
      }
      if (submission.running) return submission.running;

      const current = submission;
      const send = async (): Promise<TData> => {
        try {
          return await mutate(vars, current.key);
        } catch (error) {
          if (!isApiProblem(error) || error.code !== "idempotency_key_reused") throw error;
          console.error("Idempotency key reused", error);
          current.key = newIdempotencyKey();
          return mutate(vars, current.key);
        }
      };
      current.running = send().then(
        (data) => {
          if (last.current === current) last.current = null;
          return data;
        },
        (error: unknown) => {
          // Sent again with this key, erp-api replays it if it did succeed, or runs it if it didn't.
          current.running = undefined;
          if (isApiProblem(error) && error.code === "idempotency_in_progress") throw { ...error, detail: STILL_WORKING };
          throw error;
        },
      );
      return current.running;
    },
  });
}
