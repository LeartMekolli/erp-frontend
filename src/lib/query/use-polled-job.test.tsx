import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OfflineError } from "@/lib/session/client-session";

import { createQueryClient } from "./query-client";
import {
  POLL_DELAYS_MS,
  SLOW_AFTER_MS,
  aiRunState,
  exportState,
  payoutState,
  usePolledJob,
  type JobState,
} from "./use-polled-job";

const START = Date.parse("2026-11-05T09:00:00Z");

/** A job that answers each state in turn, then repeats the last; records when it was asked. */
function job(states: (JobState | Error)[]) {
  const times: number[] = [];
  const queryFn = vi.fn(async () => {
    times.push(Date.now() - START);
    const next = states.length > 1 ? states.shift()! : states[0]!;
    if (next instanceof Error) throw next;
    return { status: next };
  });
  return { queryFn, times };
}

function renderJob(queryFn: () => Promise<{ status: JobState }>, delays?: readonly number[]) {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePolledJob({ queryKey: ["job"], queryFn, stateOf: (data) => data.status, delays }), {
    wrapper,
  });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => {
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe("usePolledJob", () => {
  it("polls until done, backing off", async () => {
    expect(POLL_DELAYS_MS).toEqual([1_000, 2_000, 4_000, 8_000, 10_000]);
    const { queryFn, times } = job(["pending", "pending", "working", "done"]);
    const { result } = renderJob(queryFn);
    await advance(30_000);
    expect(times).toEqual([0, 1_000, 3_000, 7_000]);
    expect(result.current.state).toBe("done");
  });

  it("polls with the delays it is given", async () => {
    const { queryFn, times } = job(["pending"]);
    renderJob(queryFn, [...Array<number>(20).fill(500), 1_000]);
    await advance(9_999);
    expect(times).toHaveLength(20);
    expect(times.at(-1)).toBe(9_500);
    await advance(2_000);
    expect(times.slice(20)).toEqual([10_000, 11_000]);
  });

  it("caps the delay at 10 seconds", async () => {
    const { queryFn, times } = job(["pending"]);
    renderJob(queryFn);
    await advance(60_000);
    // 0, +1, +2, +4, +8, then every 10 s.
    expect(times.slice(0, 8)).toEqual([0, 1_000, 3_000, 7_000, 15_000, 25_000, 35_000, 45_000]);
  });

  it.each(["failed", "expired"] as const)("stops on %s", async (end) => {
    const { queryFn } = job(["pending", end]);
    const { result } = renderJob(queryFn);
    await advance(60_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe(end);
  });

  it("does not poll while the tab is hidden", async () => {
    const { queryFn } = job(["pending"]);
    renderJob(queryFn);
    await advance(0);
    focusManager.setFocused(false);
    await advance(60_000);
    expect(queryFn).toHaveBeenCalledTimes(1);
    focusManager.setFocused(true);
    await advance(1_000);
    expect(queryFn.mock.calls.length).toBeGreaterThan(1);
  });

  it("is not failed when offline", async () => {
    const { queryFn } = job(["pending", new OfflineError()]);
    const { result } = renderJob(queryFn);
    await advance(1_500);
    expect(result.current.state).toBe("pending");
    expect(result.current.offline).toBe(true);
  });

  it("says it is slow after two minutes", async () => {
    expect(SLOW_AFTER_MS).toBe(120_000);
    const { queryFn } = job(["pending"]);
    const { result } = renderJob(queryFn);
    await advance(60_000);
    expect(result.current.slow).toBe(false);
    await advance(70_000);
    expect(result.current.slow).toBe(true);
  });

  it("is loading before the first answer", () => {
    const { queryFn } = job(["pending"]);
    const { result } = renderJob(queryFn);
    expect(result.current.state).toBe("loading");
  });
});

describe("erp-api job states", () => {
  it.each([
    ["pending", "pending"],
    ["ready", "done"],
    ["failed", "failed"],
    ["expired", "expired"],
  ] as const)("maps export %s to %s", (status, state) => expect(exportState(status)).toBe(state));

  it.each([
    ["pending", "pending"],
    ["done", "done"],
    ["failed", "failed"],
  ] as const)("maps AI run %s to %s", (status, state) => expect(aiRunState(status)).toBe(state));

  it.each([
    ["pending", "pending"],
    ["paid", "done"],
    ["failed", "failed"],
    ["reversed", "failed"],
  ] as const)("maps payout %s to %s", (status, state) => expect(payoutState(status)).toBe(state));
});
