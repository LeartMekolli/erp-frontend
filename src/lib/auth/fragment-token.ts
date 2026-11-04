/**
 * The token from an erp-api email link (`/reset-password#token=…`). erp-api
 * puts it in the fragment so it never reaches a server (`web-links.ts`); this
 * also removes it from the address at once, so it isn't left in history,
 * bookmarks or a shared screenshot.
 */
export function takeFragmentToken(): string | null {
  const { hash, pathname, search } = window.location;
  if (!hash) return null;
  const token = new URLSearchParams(hash.slice(1)).get("token");
  window.history.replaceState(null, "", pathname + search);
  return token || null;
}
