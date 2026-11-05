"use client";

import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useState } from "react";

import { OfflineError } from "@/lib/session/client-session";

import { useOnline } from "./use-online";

/** Where a piece of background work is, whatever erp-api calls it. */
export type JobState = "pending" | "working" | "done" | "failed" | "expired";

/** Wait this long before each next poll; the last delay repeats. */
export const POLL_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 10_000] as const;
/** Still unfinished this long after it started: say so. */
export const SLOW_AFTER_MS = 120_000;

const FINISHED: ReadonlySet<JobState> = new Set(["done", "failed", "expired"]);

/**
 * Follows work erp-api does in the background (a 202, an upload being
 * measured) by polling, sooner at first, then every 10 s, until it is done,
 * failed or expired. Never polls a hidden tab (the query client's rule). A
 * failed poll is not a failed job: the last known state stays.
 */
export function usePolledJob<T>(options: {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  stateOf: (data: T) => JobState;
  enabled?: boolean;
  /** Overrides `POLL_DELAYS_MS`, for work worth checking sooner. */
  delays?: readonly number[];
}) {
  const { stateOf, delays = POLL_DELAYS_MS } = options;
  const [startedAt] = useState(Date.now);
  const online = useOnline();
  const query = useQuery({
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    enabled: options.enabled,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (data !== undefined && FINISHED.has(stateOf(data))) return false;
      const polls = Math.max(q.state.dataUpdateCount, 1);
      return delays[Math.min(polls, delays.length) - 1];
    },
  });

  const state: JobState | "loading" = query.data === undefined ? "loading" : stateOf(query.data);
  const finished = state !== "loading" && FINISHED.has(state);
  return {
    state,
    data: query.data,
    slow: !finished && query.dataUpdatedAt - startedAt >= SLOW_AFTER_MS,
    offline: query.error instanceof OfflineError || !online,
    error: query.error,
  };
}

/** `GET /reports/exports/{id}` (`export-response.ts:12`). */
export function exportState(status: "pending" | "ready" | "failed" | "expired"): JobState {
  return status === "ready" ? "done" : status;
}

/** `GET /ai/runs/{id}` (`run-response.ts:21`). */
export function aiRunState(status: "pending" | "done" | "failed"): JobState {
  return status;
}

/** A payout from `POST /partners/{id}/payouts`, read back from the list (`payment-response.ts:137`). */
export function payoutState(status: "pending" | "paid" | "failed" | "reversed"): JobState {
  if (status === "paid") return "done";
  if (status === "reversed") return "failed";
  return status;
}
