"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { useRef } from "react";

import { newIdempotencyKey } from "@/lib/api/idempotency";

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
      current.running = mutate(vars, current.key).then(
        (data) => {
          if (last.current === current) last.current = null;
          return data;
        },
        (error: unknown) => {
          // Sent again with this key, erp-api replays it if it did succeed, or runs it if it didn't.
          current.running = undefined;
          throw error;
        },
      );
      return current.running;
    },
  });
}
