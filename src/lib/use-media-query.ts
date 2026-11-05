"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, following changes. False on the server
 * and where `matchMedia` is missing, so the narrow layout is the fallback.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}
