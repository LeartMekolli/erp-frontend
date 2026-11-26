"use client";

import { useEffect, useRef, useState } from "react";

import type { MoveBody, StepGroup } from "@/lib/api/schema-types";

/** How long a pass that asks for nothing waits, with Undo, before it is sent. */
export const HOLD_MS = 5000;

/** A pass waiting to be sent. Its `Idempotency-Key` is made when it's held, so sending it twice acts once. */
export interface HeldMove {
  /** The product type it was held on: its card shows only there. */
  workflowId: string;
  body: MoveBody;
  key: string;
  fromStep: string;
  toStep: { key: string; name: string };
  /** The lines it moves, as listed, to show the passing card at `toStep`. */
  lines: StepGroup[];
  pieces: number;
}

/**
 * One pass at a time, held for `HOLD_MS` with Undo. It's sent when the time is up, when another pass is held,
 * or when the page is left; when the tab is hidden or closed (`visibilitychange`, `pagehide`) it's sent as a
 * request that outlives the page (`keepalive`). Each held move is sent at most once.
 */
export function useHeldMove(send: (move: HeldMove, keepalive: boolean) => Promise<void>): {
  held: HeldMove | null;
  hold: (move: HeldMove) => void;
  undo: () => boolean;
} {
  const [held, setHeld] = useState<HeldMove | null>(null);
  // The waiting move and its timer, read by the page listeners and the unmount, outside React's renders.
  const waiting = useRef<{ move: HeldMove; timer: ReturnType<typeof setTimeout> } | null>(null);
  const latestSend = useRef(send);
  useEffect(() => {
    latestSend.current = send;
  });

  /** Takes the waiting move off the hold, so nothing else sends it. */
  function release(): HeldMove | null {
    const current = waiting.current;
    if (!current) return null;
    clearTimeout(current.timer);
    waiting.current = null;
    return current.move;
  }

  function flush(keepalive: boolean) {
    const move = release();
    if (!move) return;
    setHeld(null);
    void latestSend.current(move, keepalive);
  }

  // `flush` only reads refs, so the listeners set up once always reach the current move and `send`.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    // Closing a tab hides it before `pagehide`, so a hidden tab sends as a request that outlives the page too.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushRef.current(true);
    };
    const onPageHide = () => flushRef.current(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      flushRef.current(false);
    };
  }, []);

  function hold(move: HeldMove) {
    flush(false);
    waiting.current = { move, timer: setTimeout(() => flushRef.current(false), HOLD_MS) };
    setHeld(move);
  }

  /** Cancels the waiting move; false when there was none any more (it was just sent). */
  function undo(): boolean {
    if (!release()) return false;
    setHeld(null);
    return true;
  }

  return { held, hold, undo };
}
