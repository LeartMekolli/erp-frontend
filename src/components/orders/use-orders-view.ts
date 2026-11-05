"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { defaultSort, parseView, viewToSearch, type OrdersView } from "@/lib/orders/view";

export type ViewChange = Partial<OrdersView>;

/**
 * The view after a change. A new tab starts on its own default sort with no
 * reason (reasons belong to Needs you); a sort equal to the tab's default is
 * left out, so the URL stays short.
 */
export function applyChange(view: OrdersView, change: ViewChange): OrdersView {
  const next = { ...view, ...change };
  if (change.tab !== undefined && change.tab !== view.tab) {
    next.reason = null;
    if (change.sort === undefined) next.sort = null;
  }
  if (next.tab !== "needs") next.reason = null;
  if (next.sort === defaultSort(next.tab)) next.sort = null;
  return next;
}

/**
 * The Orders list's view, kept in the URL. A tab change adds a history step,
 * so Back returns to the previous tab; anything else replaces the current one.
 */
export function useOrdersView(): [OrdersView, (change: ViewChange) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params.toString();
  const view = useMemo(() => parseView(new URLSearchParams(search)), [search]);

  function change(next: ViewChange) {
    const query = viewToSearch(applyChange(view, next));
    const href = query ? `${pathname}?${query}` : pathname;
    if (next.tab !== undefined && next.tab !== view.tab) router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  return [view, change];
}
