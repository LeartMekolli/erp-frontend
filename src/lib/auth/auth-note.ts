/**
 * "Just signed out", for the sign-in page's server half: it skips sending someone signed in back home, since
 * the session cookie may not be cleared yet. A cookie, because the server reads it, and shared by the tabs,
 * which is right: they're all signed out together. It carries nothing else. Why, where back to and which
 * workspace are per tab, so they travel in an arrival note (`@/lib/navigation/arrival-note`).
 * It lasts a minute, and a successful sign-in clears it.
 */
export const SIGNED_OUT_COOKIE = "ami_signed_out";

const MAX_AGE_S = 60;

function writeCookie(value: string, maxAge: number): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${SIGNED_OUT_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

/** In the browser, just before moving to `/sign-in` after a sign-out. */
export function markSignedOut(): void {
  writeCookie("1", MAX_AGE_S);
}

/** In the browser, once signed in. */
export function clearSignedOut(): void {
  writeCookie("", 0);
}
