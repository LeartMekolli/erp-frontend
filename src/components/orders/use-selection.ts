"use client";

import { useState } from "react";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The ticked orders, by id. Cleared whenever `viewKey` (the view as its
 * address-bar search) changes, so a selection never hides behind another tab
 * or filter; a refetch keeps it.
 */
export function useSelection(viewKey: string) {
  const [state, setState] = useState({ key: viewKey, ids: EMPTY });
  // Reset while rendering when the view changes (React's "adjusting state on a prop change").
  if (state.key !== viewKey) setState({ key: viewKey, ids: EMPTY });
  const ids = state.key === viewKey ? state.ids : EMPTY;

  const update = (change: (ids: Set<string>) => void) =>
    setState((current) => {
      const next = new Set(current.key === viewKey ? current.ids : EMPTY);
      change(next);
      return { key: viewKey, ids: next };
    });

  return {
    ids,
    toggle: (id: string) =>
      update((next) => {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }),
    setAll: (list: string[], on: boolean) =>
      update((next) => {
        for (const id of list) {
          if (on) next.add(id);
          else next.delete(id);
        }
      }),
    clear: () => setState({ key: viewKey, ids: EMPTY }),
  };
}

export type Selection = ReturnType<typeof useSelection>;
