import { WORKSPACE_SLUG } from "@/lib/routes";
import type { SignOutReason } from "@/lib/session/client-session";

/**
 * What the sign-in pages are told on the way in, kept out of the address (CLAUDE.md § Addresses): why the
 * person was signed out, the page to go back to, and the workspace to fill in. A cookie, so the server page
 * can read it. Shared by the tabs, so it's never cleared on arrival: every tab signed out together reads it.
 * It lasts a minute, and a successful sign-in clears it.
 */
export const AUTH_NOTE_COOKIE = "ami_auth_note";

export type AuthNote = { reason?: SignOutReason; next?: string; workspace?: string };

const REASONS: readonly string[] = ["signed-out", "idle", "expired", "revoked"] satisfies SignOutReason[];
const MAX_NEXT = 2048;
const MAX_AGE_S = 60;

/** The note in the cookie's value. Anyone can write this cookie, so only known values are kept; `next` still goes through `safeNext`. */
export function parseAuthNote(raw: string | undefined): AuthNote {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(raw));
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { reason, next, workspace } = value as Record<string, unknown>;
  const note: AuthNote = {};
  if (typeof reason === "string" && REASONS.includes(reason)) note.reason = reason as SignOutReason;
  if (typeof next === "string" && next.length <= MAX_NEXT) note.next = next;
  if (typeof workspace === "string" && WORKSPACE_SLUG.test(workspace)) note.workspace = workspace;
  return note;
}

function writeCookie(value: string, maxAge: number): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${AUTH_NOTE_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

/** In the browser, just before moving to a sign-in page: replaces any note left before. */
export function leaveAuthNote(note: AuthNote): void {
  writeCookie(encodeURIComponent(JSON.stringify(note)), MAX_AGE_S);
}

/** In the browser, once signed in. */
export function clearAuthNote(): void {
  writeCookie("", 0);
}
