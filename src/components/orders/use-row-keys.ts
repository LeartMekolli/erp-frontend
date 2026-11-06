"use client";

import type { KeyboardEvent } from "react";

/** Keys typed into a field are text, never shortcuts. */
function isTyping(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The table's keys (spec §5.8): J or ↓ moves to the next row, K or ↑ to the
 * previous one, Enter opens the row, X ticks it. Rows are found by
 * `data-row-id` inside the table, so the row with focus is the active one and
 * a refetch, which keeps each row's element, keeps it.
 */
export function useRowKeys(actions: { open(id: string): void; toggle(id: string): void }) {
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
    // Keys in a row's menu or a dialog arrive through React's tree from a portal: theirs, not the table's.
    if (!event.currentTarget.contains(event.target as Node)) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-row-id]");
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-row-id]"));
    const index = row ? rows.indexOf(row) : -1;
    const move = (to: number) => {
      event.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
    };

    switch (event.key) {
      case "j":
      case "ArrowDown":
        move(index + 1);
        break;
      case "k":
      case "ArrowUp":
        move(index < 0 ? 0 : index - 1);
        break;
      case "Enter":
        // Enter on the row itself: a checkbox or link inside it handles its own.
        if (row && event.target === row) {
          event.preventDefault();
          actions.open(row.dataset.rowId!);
        }
        break;
      case "x":
        if (row) {
          event.preventDefault();
          actions.toggle(row.dataset.rowId!);
        }
        break;
    }
  }

  return { onKeyDown };
}
