/*
 * The token from an erp-api email link (`/reset-password#token=…`). erp-api
 * puts it in the fragment so it never reaches a server (`web-links.ts`); AMI
 * also removes it from the address at once, so it isn't left in history,
 * bookmarks or a shared screenshot.
 */

/** The link's token, or null. Reads only: safe while rendering. */
export function readFragmentToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") || null;
}

/**
 * Removes the fragment from the address. Next.js's router listens to
 * `replaceState`, so call this from an effect, never while rendering.
 */
export function clearFragment(): void {
  const { hash, pathname, search } = window.location;
  if (hash) window.history.replaceState(null, "", pathname + search);
}
