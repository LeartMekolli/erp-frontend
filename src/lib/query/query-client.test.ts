import { focusManager, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OfflineError, SessionEndedError, clientSession } from "@/lib/session/client-session";

import { REFRESH_INTERVAL_MS, createQueryClient } from "./query-client";

let stop: () => void = () => {};

function observe() {
  const client = createQueryClient();
  // As QueryClientProvider does: mounting subscribes the client to focus and online changes.
  client.mount();
  const queryFn = vi.fn(async () => "data");
  const observer = new QueryObserver(client, { queryKey: ["t"], queryFn });
  const unsubscribe = observer.subscribe(() => {});
  stop = () => {
    unsubscribe();
    client.unmount();
  };
  return queryFn;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  stop();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe("createQueryClient", () => {
  it("refetches every 60 seconds while visible", async () => {
    expect(REFRESH_INTERVAL_MS).toBe(60_000);
    const queryFn = observe();
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("does not refetch while the tab is hidden", async () => {
    const queryFn = observe();
    await vi.advanceTimersByTimeAsync(0);
    focusManager.setFocused(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("refetches when the tab regains focus", async () => {
    const queryFn = observe();
    await vi.advanceTimersByTimeAsync(0);
    focusManager.setFocused(false);
    await vi.advanceTimersByTimeAsync(120_000);
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("never counts a refetch as activity", async () => {
    const recordActivity = vi.spyOn(clientSession(), "recordActivity");
    observe();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("does not retry a session end or offline", () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry;
    if (typeof retry !== "function") throw new Error("retry should be a function");
    expect(retry(0, new SessionEndedError("idle"))).toBe(false);
    expect(retry(0, new OfflineError())).toBe(false);
    expect(retry(0, new Error("500"))).toBe(true);
    expect(retry(2, new Error("500"))).toBe(false);
  });

  it("never retries a mutation", () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
