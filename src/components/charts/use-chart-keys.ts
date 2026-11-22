"use client";

import { useState, type KeyboardEvent } from "react";

/**
 * Keyboard stepping through a chart's points. Spread `bind` on the focusable
 * chart element; `onMove` gets each new index, or null when focus leaves or Escape is pressed.
 */
export function useChartKeys(count: number, onMove: (index: number | null) => void) {
  const [index, setIndex] = useState<number | null>(null);

  function move(next: number | null) {
    setIndex(next);
    onMove(next);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (count <= 0) return;
    const last = count - 1;
    switch (e.key) {
      case "ArrowRight":
        move(index === null ? 0 : Math.min(index + 1, last));
        break;
      case "ArrowLeft":
        move(index === null ? last : Math.max(index - 1, 0));
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(last);
        break;
      case "Escape":
        move(null);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  function onBlur() {
    if (index !== null) move(null);
  }

  return { index, bind: { tabIndex: 0 as const, onKeyDown, onBlur } };
}
