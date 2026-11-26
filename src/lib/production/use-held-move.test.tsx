import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOLD_MS, useHeldMove, type HeldMove } from "./use-held-move";

function heldMove(n: number): HeldMove {
  return {
    workflowId: "workflow-1",
    body: { kind: "pass", work_order_ids: [`piece-${n}`], at_step: "print" },
    key: `key-${n}`,
    fromStep: "print",
    toStep: { key: "finish", name: "Finish" },
    lines: [],
    pieces: 1,
  };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

let send: ReturnType<typeof vi.fn<(move: HeldMove, keepalive: boolean) => Promise<void>>>;
beforeEach(() => {
  vi.useFakeTimers();
  send = vi.fn<(move: HeldMove, keepalive: boolean) => Promise<void>>(() => Promise.resolve());
});
afterEach(() => {
  vi.useRealTimers();
  // Back to jsdom's own `visibilityState`.
  delete (document as { visibilityState?: unknown }).visibilityState;
});

function holdOne() {
  const hook = renderHook(() => useHeldMove(send));
  act(() => hook.result.current.hold(heldMove(1)));
  return hook;
}

describe("useHeldMove", () => {
  it("waits 5 seconds, then sends the move once", () => {
    const { result } = holdOne();
    expect(HOLD_MS).toBe(5000);
    expect(result.current.held?.key).toBe("key-1");
    act(() => vi.advanceTimersByTime(4999));
    expect(send).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(send).toHaveBeenCalledExactlyOnceWith(heldMove(1), false);
    expect(result.current.held).toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends nothing after Undo", () => {
    const { result, unmount } = holdOne();
    act(() => vi.advanceTimersByTime(3000));
    let undone = false;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(true);
    expect(result.current.held).toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    window.dispatchEvent(new Event("pagehide"));
    unmount();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends at once, as a request that outlives the page, when the tab is hidden; not again after the 5 seconds", () => {
    const { result } = holdOne();
    act(() => vi.advanceTimersByTime(1000));
    act(() => setVisibility("hidden"));
    expect(send).toHaveBeenCalledExactlyOnceWith(heldMove(1), true);
    expect(result.current.held).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("closing a tab hides it before pagehide: still one send that outlives the page", () => {
    holdOne();
    act(() => setVisibility("hidden"));
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(send).toHaveBeenCalledExactlyOnceWith(heldMove(1), true);
  });

  it("says Undo came too late once the move was sent", () => {
    const { result } = holdOne();
    act(() => vi.advanceTimersByTime(5000));
    let undone = true;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting when the tab becomes visible", () => {
    holdOne();
    act(() => setVisibility("visible"));
    expect(send).not.toHaveBeenCalled();
  });

  it("sends at once when the page is left", () => {
    const { unmount } = holdOne();
    act(() => vi.advanceTimersByTime(1000));
    unmount();
    expect(send).toHaveBeenCalledExactlyOnceWith(heldMove(1), false);
    act(() => vi.advanceTimersByTime(5000));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends as a request that outlives the page when the tab is closed", () => {
    const { unmount } = holdOne();
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(send).toHaveBeenCalledExactlyOnceWith(heldMove(1), true);
    // Whatever else ends the wait afterwards, it was sent once.
    act(() => setVisibility("hidden"));
    expect(send).toHaveBeenCalledTimes(1);
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends the waiting move at once when a second one is held", () => {
    const { result } = holdOne();
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.hold(heldMove(2)));
    expect(send).toHaveBeenCalledExactlyOnceWith(heldMove(1), false);
    expect(result.current.held?.key).toBe("key-2");
    // The second waits its own full 5 seconds.
    act(() => vi.advanceTimersByTime(4999));
    expect(send).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(send).toHaveBeenLastCalledWith(heldMove(2), false);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
