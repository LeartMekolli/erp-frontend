"use client";

import { useState } from "react";

import { DEFAULT_VIEW, defaultSort, type OrdersView } from "@/lib/orders/view";

export type ViewChange = Partial<OrdersView>;

/**
 * The view after a change. A new tab starts on its own default sort with no
 * reason unless the change brings one (a tile picks Needs you and a reason
 * together); reasons belong to Needs you only; a sort equal to the tab's default is
 * stored as null.
 */
export function applyChange(view: OrdersView, change: ViewChange): OrdersView {
  const next = { ...view, ...change };
  if (change.tab !== undefined && change.tab !== view.tab) {
    if (change.reason === undefined) next.reason = null;
    if (change.sort === undefined) next.sort = null;
  }
  if (next.tab !== "needs") next.reason = null;
  if (next.sort === defaultSort(next.tab)) next.sort = null;
  return next;
}

/** The Orders list's view, kept on the page only: the URL stays `/orders` and a reload starts on Needs you. */
export function useOrdersView(): [OrdersView, (change: ViewChange) => void] {
  const [view, setView] = useState(DEFAULT_VIEW);
  return [view, (change) => setView((current) => applyChange(current, change))];
}
