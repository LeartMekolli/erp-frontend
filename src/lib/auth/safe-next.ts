/** Pages a return link must never lead back to. */
const AUTH_ROUTES = ["/sign-in", "/forgot-password", "/reset-password", "/accept-invitation"];

const BASE = "http://ami.invalid";

/**
 * The page to return to after sign-in, if `next` is a plain path on AMI
 * itself; otherwise `fallback`. Guards against open redirects such as
 * `//evil.example`, `/\evil.example` and `javascript:` links.
 */
export function safeNext(next: string | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\") || [...next].some((c) => c <= "\u001f" || c === "\u007f")) return fallback;

  const url = new URL(next, BASE);
  if (url.origin !== BASE) return fallback;
  if (AUTH_ROUTES.some((route) => url.pathname === route || url.pathname.startsWith(`${route}/`))) return fallback;

  return next;
}
