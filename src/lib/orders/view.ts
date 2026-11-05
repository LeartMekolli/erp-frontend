import type { NeedsReason, OrderCountsQuery, OrderListQuery, OrderSort, PaymentState } from "@/lib/api/schema-types";

import { addDays } from "./labels";

export const TABS = ["needs", "all", "awaiting_payment", "in_production", "ready", "shipped", "delivered", "cancelled"] as const;
export type Tab = (typeof TABS)[number];

export const NEEDS_REASONS = ["late", "to_ship", "to_collect", "due_soon"] as const satisfies readonly NeedsReason[];
export const PAYMENT_STATES = [
  "awaiting_payment",
  "paid",
  "not_billed",
  "invoiced",
  "overdue",
  "refunded",
  "partly_refunded",
  "none",
] as const satisfies readonly PaymentState[];
export const ORDER_SORTS = ["promised_on", "-promised_on", "-placed_at", "placed_at"] as const satisfies readonly OrderSort[];

/** What the Orders list shows: kept in the URL so a view can be shared, reloaded and gone back to. */
export interface OrdersView {
  tab: Tab;
  /** Narrows Needs you to one reason. */
  reason: NeedsReason | null;
  payment: PaymentState[];
  /** First promised day, included. */
  from: string | null;
  /** Last promised day, included. */
  to: string | null;
  q: string | null;
  /** Null: the tab's own default. */
  sort: OrderSort | null;
}

export const DEFAULT_VIEW: OrdersView = { tab: "needs", reason: null, payment: [], from: null, to: null, q: null, sort: null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | null =>
  value !== null && (values as readonly string[]).includes(value) ? (value as T) : null;

/** Reads a view from the URL; unknown values are dropped, never thrown. */
export function parseView(params: URLSearchParams): OrdersView {
  const tab = oneOf(TABS, params.get("tab")) ?? "needs";
  const day = (key: string) => {
    const value = params.get(key);
    return value !== null && DAY.test(value) ? value : null;
  };
  return {
    tab,
    reason: tab === "needs" ? oneOf(NEEDS_REASONS, params.get("reason")) : null,
    payment: (params.get("payment") ?? "")
      .split(",")
      .map((value) => oneOf(PAYMENT_STATES, value))
      .filter((value): value is PaymentState => value !== null),
    from: day("from"),
    to: day("to"),
    q: params.get("q")?.trim() || null,
    sort: oneOf(ORDER_SORTS, params.get("sort")),
  };
}

/** The view as a query string, defaults left out. */
export function viewToSearch(view: OrdersView): string {
  const params = new URLSearchParams();
  if (view.tab !== "needs") params.set("tab", view.tab);
  if (view.reason && view.tab === "needs") params.set("reason", view.reason);
  if (view.payment.length) params.set("payment", view.payment.join(","));
  if (view.from) params.set("from", view.from);
  if (view.to) params.set("to", view.to);
  if (view.q) params.set("q", view.q);
  if (view.sort) params.set("sort", view.sort);
  return params.toString();
}

const OPEN_TABS: readonly Tab[] = ["needs", "awaiting_payment", "in_production", "ready"];

/** Open work sorts by promised date, soonest first; the rest newest first. */
export function defaultSort(tab: Tab): OrderSort {
  return OPEN_TABS.includes(tab) ? "promised_on" : "-placed_at";
}

function filters(view: OrdersView): OrderCountsQuery {
  const query: OrderCountsQuery = {};
  if (view.payment.length) query.payment_state = view.payment.join(",");
  if (view.from) query.promised_after = view.from;
  // erp-api's promised_before excludes its day; the person's "to" includes it.
  if (view.to) query.promised_before = addDays(view.to, 1);
  if (view.q) query.q = view.q;
  return query;
}

/** `GET /orders`'s query for a view, first page. */
export function listQuery(view: OrdersView): OrderListQuery {
  const query: OrderListQuery = filters(view);
  if (view.tab === "needs") query.needs = view.reason ?? NEEDS_REASONS.join(",");
  else if (view.tab !== "all") query.state = view.tab;
  query.sort = view.sort ?? defaultSort(view.tab);
  query.limit = 50;
  return query;
}

/** `GET /orders/counts`'s query for a view: the filters that don't pick a tab. */
export function countsQuery(view: OrdersView): OrderCountsQuery {
  return filters(view);
}
