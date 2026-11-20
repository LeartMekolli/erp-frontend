"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import type { Checkout } from "./use-checkout";

/** Any open dialog except the ticket's own sheet, which carries `data-ticket`. */
const OTHER_DIALOG = "[role=dialog]:not([data-ticket]), [role=alertdialog]:not([data-ticket])";

/**
 * ⌘Enter (Ctrl+Enter elsewhere) presses the main button from anywhere on the page: Get price, Get new
 * price or Place order, whichever it is now. It does nothing when something else handled the key, while
 * another dialog is open (leave, change customer), when the action is off, or for a held key's repeats,
 * so holding it can't get a price and then place it.
 */
export function useMainShortcut(main: Checkout["main"]): void {
  // The listener is added once and reads the action of the last commit. It is updated in a layout effect,
  // so a key pressed right after a change (a discrete event, whose render and effects are flushed before
  // the next one) runs the action for what is on screen now, never the one before it.
  const latest = useRef(main);
  useLayoutEffect(() => {
    latest.current = main;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      if (event.defaultPrevented || event.repeat) return;
      if (document.querySelector(OTHER_DIALOG) !== null) return;
      const action = latest.current;
      if (action.off) return;
      // Stops a focused button or field from also taking the Enter.
      event.preventDefault();
      action.run();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
