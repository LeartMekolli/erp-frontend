import { vi } from "vitest";

/** The New order page's wide layout, as `useMediaQuery` asks for it. */
const WIDE = "(min-width: 1280px)";

/**
 * Stubs `window.matchMedia` so the wide query matches when `wide` is true; any other query never
 * matches. The caller restores it with `vi.unstubAllGlobals()` in `afterEach`.
 */
export function setWide(wide: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList => ({
      matches: query === WIDE && wide,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  );
}
