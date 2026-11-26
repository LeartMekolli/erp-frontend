"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { SignOutReason } from "@/lib/session/client-session";

/**
 * A one-time message for the page AMI is about to open, kept out of the address (CLAUDE.md § Addresses).
 * Only for moves inside AMI: it lives in this tab's memory, so a reload or a link from outside never sees it.
 */
export type ArrivalNote = {
  /** A payout notification opens the partner's Payouts tab. */
  partnerTab?: "payouts";
  /** New order placed it: the order page says so. */
  placed?: true;
  /** Production's History linked to one of the order's pieces (a work order id): the order page opens its story. */
  piece?: string;
  /** The payment provider's answer after payout setup. */
  onboarding?: "done" | "expired";
  /** Sign-in: why this tab was signed out. */
  reason?: SignOutReason;
  /** Sign-in: the page to go back to, checked with `safeNext` before use. */
  next?: string;
  /** Sign-in and Forgot password: the workspace to fill in. */
  workspace?: string;
};

const notes = new Map<string, ArrivalNote>();
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Leaves `note` for the page at `path`, replacing any note already there. Call it just before moving. */
export function leaveArrivalNote(path: string, note: ArrivalNote): void {
  notes.set(path, note);
  tell();
}

/**
 * Whether a click on a link opens it in this tab: a plain left click. Cmd-, Ctrl-, Shift- and Alt-clicks open
 * another tab or window, or download, and a middle click a new tab. A note is per tab, so a link leaves one only
 * for this kind of click; otherwise it would wait here, unused, and greet the next visit to that page.
 */
export function opensHere(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Tests only: forgets every note. */
export function resetArrivalNotes(): void {
  notes.clear();
  tell();
}

/**
 * Hands the page at `path` the note left for it, once: on its first render when the note came first, or as
 * soon as one is left while the page is open (a notification for the page already on screen). `onArrive`
 * runs while rendering, so the state it sets is in the first paint; the note is deleted after that commit.
 */
export function useArrivalNote(path: string, onArrive: (note: ArrivalNote) => void): void {
  const note = useSyncExternalStore(
    subscribe,
    () => notes.get(path) ?? null,
    () => null,
  );
  const [handled, setHandled] = useState<ArrivalNote | null>(null);
  if (note !== null && note !== handled) {
    setHandled(note);
    onArrive(note);
  }

  useEffect(() => {
    // Only this note: a newer one left meanwhile waits for its own render.
    if (note === null || notes.get(path) !== note) return;
    notes.delete(path);
    tell();
  }, [note, path]);
}
