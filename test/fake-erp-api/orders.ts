/**
 * The fake erp-api's orders: the staff list with its filters, the tab counts,
 * shipping and payments recorded by hand. It keeps the rules the Orders screen
 * depends on (erp-api `src/modules/orders/`): the needs-you reasons
 * (`needs.ts:27-45`), filters combined with AND, a cursor tied to its sort,
 * ship only when ready, and one-time `Idempotency-Key`s.
 */

import type {
  BulkShipResult,
  CancelOrderBody,
  NeedsReason,
  Order,
  OrderCounts,
  OrderSort,
  OrderState,
  PaidByHandBody,
  PaymentState,
  ShipBody,
  ShipManyBody,
} from "../../src/lib/api/schema-types";

import { addDays, seedOrders, type StoredOrder } from "./orders-seed";

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export interface FieldError {
  path: string;
  message: string;
}

/** What a route answers: a body, field errors (400), or a problem with its detail and, with a `code`, its extension members. */
export type Answer<T> =
  | { ok: true; body: T }
  | { ok: false; status: 400; errors: FieldError[] }
  | { ok: false; status: 403 | 404 | 409 | 503; detail: string; code?: string; extensions?: Record<string, unknown> };

const ORDER_STATES = ["awaiting_payment", "in_production", "ready", "shipped", "delivered", "cancelled"] as const satisfies readonly OrderState[];
const PAYMENT_STATES = [
  "awaiting_payment",
  "paid",
  "not_billed",
  "invoiced",
  "overdue",
  "refunded",
  "partly_refunded",
  "none",
] as const satisfies readonly PaymentState[];
const NEEDS_REASONS = ["late", "to_ship", "to_collect", "due_soon"] as const satisfies readonly NeedsReason[];
const SORTS = ["placed_at", "-placed_at", "promised_on", "-promised_on"] as const satisfies readonly OrderSort[];

/** Working days on from today that an unfinished order is due soon (erp-api `needs.ts:14`). */
export const DUE_SOON_WORKING_DAYS = 2;

const UNSHIPPED: OrderState[] = ["awaiting_payment", "in_production", "ready"];
const UNMADE: OrderState[] = ["awaiting_payment", "in_production"];

/** The day `n` working days (Monday to Friday) after `today`. */
export function workingDaysAfter(today: string, n: number): string {
  let day = today;
  for (let left = n; left > 0; ) {
    day = addDays(day, 1);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return day;
}

/** Every reason the order needs staff today, in erp-api's order. */
export function orderNeeds(order: StoredOrder, today: string): NeedsReason[] {
  const dueSoonUntil = workingDaysAfter(today, DUE_SOON_WORKING_DAYS);
  const matches: Record<NeedsReason, boolean> = {
    late: order.promised_on < today && UNSHIPPED.includes(order.state),
    to_ship: order.state === "ready",
    to_collect: order.payment.state === "overdue" || order.state === "awaiting_payment",
    due_soon: UNMADE.includes(order.state) && order.promised_on >= today && order.promised_on <= dueSoonUntil,
  };
  return NEEDS_REASONS.filter((reason) => matches[reason]);
}

const invalid = (path: string, message: string): Answer<never> => ({ ok: false, status: 400, errors: [{ path, message }] });

/** A comma list of known values, or the field error erp-api's `commaList` gives. */
function commaList<T extends string>(raw: string | null, allowed: readonly T[], path: string): T[] | null | FieldError {
  if (raw === null) return null;
  const values = raw.split(",");
  const unknown = values.find((value) => !(allowed as readonly string[]).includes(value));
  return unknown === undefined ? (values as T[]) : { path, message: `Unknown value: ${unknown}` };
}

const isError = (value: unknown): value is FieldError => typeof value === "object" && value !== null && "path" in value;

interface Filters {
  customerId: string | null;
  state: OrderState[] | null;
  payment: PaymentState[] | null;
  needs: NeedsReason[] | null;
  after: string | null;
  before: string | null;
  q: string | null;
}

const LIST_KEYS = ["limit", "cursor", "customer_id", "state", "payment_state", "needs", "promised_after", "promised_before", "q", "sort"];
const COUNTS_KEYS = ["customer_id", "payment_state", "promised_after", "promised_before", "q"];

function readFilters(params: URLSearchParams, keys: string[]): Filters | Answer<never> {
  const extra = [...params.keys()].find((key) => !keys.includes(key));
  if (extra) return invalid(extra, `Unrecognized key: "${extra}"`);
  const state = commaList(params.get("state"), ORDER_STATES, "state");
  const payment = commaList(params.get("payment_state"), PAYMENT_STATES, "payment_state");
  const needs = commaList(params.get("needs"), NEEDS_REASONS, "needs");
  for (const value of [state, payment, needs]) if (isError(value)) return { ok: false, status: 400, errors: [value] };
  const q = params.get("q")?.trim() ?? null;
  if (q !== null && (q.length < 1 || q.length > 100)) return invalid("q", "must be 1 to 100 characters");
  return {
    customerId: params.get("customer_id"),
    state: state as OrderState[] | null,
    payment: payment as PaymentState[] | null,
    needs: needs as NeedsReason[] | null,
    after: params.get("promised_after"),
    before: params.get("promised_before"),
    q,
  };
}

function matches(order: Order, f: Filters): boolean {
  if (f.customerId && order.customer.id !== f.customerId) return false;
  if (f.state && !f.state.includes(order.state)) return false;
  if (f.payment && !f.payment.includes(order.payment.state)) return false;
  if (f.needs && !f.needs.some((reason) => order.needs.includes(reason))) return false;
  if (f.after && order.promised_on < f.after) return false;
  if (f.before && order.promised_on >= f.before) return false;
  if (f.q) {
    const q = f.q.replace(/^#/, "").toLowerCase();
    const byNumber = /^\d+$/.test(q) && String(order.number).includes(q);
    if (!byNumber && !order.customer.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

function compare(sort: OrderSort): (a: Order, b: Order) => number {
  const field = sort.replace("-", "") as "placed_at" | "promised_on";
  const direction = sort.startsWith("-") ? -1 : 1;
  return (a, b) => direction * (a[field].localeCompare(b[field]) || a.id.localeCompare(b.id));
}

const encodeCursor = (sort: OrderSort, offset: number) => btoa(JSON.stringify({ sort, offset }));

function decodeCursor(cursor: string): { sort: string; offset: number } | null {
  try {
    const value: unknown = JSON.parse(atob(cursor));
    if (typeof value === "object" && value !== null && "sort" in value && "offset" in value) {
      const { sort, offset } = value as { sort: unknown; offset: unknown };
      if (typeof sort === "string" && typeof offset === "number") return { sort, offset };
    }
  } catch {
    // An unreadable cursor is a 400, like erp-api's signed ones.
  }
  return null;
}

/** Whole cents, so the fake's sums never go through a fractional number. */
const cents = (amount: string) => Number(amount.replace(".", ""));
const fromCents = (total: number) => `${Math.trunc(total / 100)}.${String(total % 100).padStart(2, "0")}`;

/** What is still owed on the to-collect orders, per currency, leaving out any currency owing nothing. */
function toCollectAmounts(orders: Order[]): OrderCounts["to_collect_amounts"] {
  const owed = new Map<string, number>();
  for (const order of orders.filter((o) => o.needs.includes("to_collect")))
    owed.set(order.currency, (owed.get(order.currency) ?? 0) + cents(order.total) - cents(order.payment.paid));
  return [...owed]
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}` }));
}

export function createOrdersStore(now: () => number) {
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const orders = new Map(seedOrders(today(), now()).map((order) => [order.id, order]));
  const keys = new Map<string, { input: string; body: Order }>();
  // `POST /orders/ship` replays its whole answer by key, failed entries included.
  const bulkKeys = new Map<string, { input: string; body: { results: BulkShipResult[] } }>();
  const failingLabels = new Set<string>();
  let courierAccount = true;

  const view = (order: StoredOrder): Order => ({ ...structuredClone(order), needs: orderNeeds(order, today()) });

  /** erp-api's idempotency: the same key and input replays; another input is a 409; failures release the key. */
  function once(key: string | null, input: unknown, run: () => Answer<Order>): Answer<Order> {
    const serialised = JSON.stringify(input);
    const seen = key ? keys.get(key) : undefined;
    if (seen) {
      return seen.input === serialised
        ? { ok: true, body: seen.body }
        : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };
    }
    const answer = run();
    if (answer.ok && key) keys.set(key, { input: serialised, body: answer.body });
    return answer;
  }

  return {
    list(params: URLSearchParams): Answer<Page<Order>> {
      const filters = readFilters(params, LIST_KEYS);
      if ("ok" in filters) return filters;
      const sort = (params.get("sort") ?? "-placed_at") as OrderSort;
      if (!SORTS.includes(sort)) return invalid("sort", `Unknown value: ${sort}`);
      const limit = Number(params.get("limit") ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) return invalid("limit", "must be 1 to 200");
      let offset = 0;
      const rawCursor = params.get("cursor");
      if (rawCursor !== null) {
        const cursor = decodeCursor(rawCursor);
        if (!cursor || cursor.sort !== sort) return invalid("cursor", "Invalid cursor");
        offset = cursor.offset;
      }
      const all = [...orders.values()].map(view).filter((order) => matches(order, filters)).sort(compare(sort));
      const data = all.slice(offset, offset + limit);
      const next = offset + limit < all.length ? encodeCursor(sort, offset + limit) : null;
      return { ok: true, body: { data, next_cursor: next } };
    },

    counts(params: URLSearchParams): Answer<OrderCounts> {
      const filters = readFilters(params, COUNTS_KEYS);
      if ("ok" in filters) return filters;
      const picked = [...orders.values()].map(view).filter((order) => matches(order, filters));
      const states = Object.fromEntries(ORDER_STATES.map((state) => [state, picked.filter((o) => o.state === state).length]));
      const reasons = Object.fromEntries(NEEDS_REASONS.map((reason) => [reason, picked.filter((o) => o.needs.includes(reason)).length]));
      return {
        ok: true,
        body: {
          all: picked.length,
          states: states as OrderCounts["states"],
          needs_you: { total: picked.filter((o) => o.needs.length > 0).length, ...reasons } as OrderCounts["needs_you"],
          to_collect_amounts: toCollectAmounts(picked),
        },
      };
    },

    get(id: string): Answer<Order> {
      const order = orders.get(id);
      return order ? { ok: true, body: view(order) } : { ok: false, status: 404, detail: "Order not found" };
    },

    deliver(id: string, key: string | null): Answer<Order> {
      return once(key, { id, deliver: true }, () => {
        const order = orders.get(id);
        if (!order) return { ok: false, status: 404, detail: "Order not found" };
        if (order.state !== "shipped") return { ok: false, status: 409, detail: "Only a shipped order can be delivered" };
        const delivered: StoredOrder = {
          ...order,
          state: "delivered",
          shipping: { ...order.shipping, delivered_at: new Date(now()).toISOString() },
        };
        orders.set(id, delivered);
        return { ok: true, body: view(delivered) };
      });
    },

    /** `POST /orders/{id}/cancel` (erp-api `orders.service.ts:783`): a paid order needs a refund amount and `payment.refund`. */
    cancel(id: string, body: CancelOrderBody, key: string | null, mayRefund: boolean): Answer<Order> {
      return once(key, { id, body }, () => {
        const order = orders.get(id);
        if (!order) return { ok: false, status: 404, detail: "Order not found" };
        if (order.state === "shipped" || order.state === "delivered") return { ok: false, status: 409, detail: "A shipped order can't be cancelled" };
        const paidLeft = cents(order.payment.refundable);
        if ((paidLeft > 0 || body.refund) && !mayRefund) return { ok: false, status: 403, detail: "Cancelling a paid order refunds it, which needs the payment.refund permission" };
        if (paidLeft > 0 && !body.refund) return invalid("refund.amount", "required: up to the amount paid, or 0.00 to refund nothing");
        const open = order.lines.filter((line) => line.state !== "cancelled").map((line) => line.position);
        const targets = body.lines ?? open;
        if (targets.length === 0) return { ok: false, status: 409, detail: "Nothing left to cancel" };
        if (targets.some((position) => !order.lines.some((line) => line.position === position))) return invalid("lines", "not a line of this order");
        if (targets.some((position) => !open.includes(position))) return { ok: false, status: 409, detail: "That line is already cancelled" };
        if (body.partner_owed?.some((entry) => !targets.includes(entry.position))) return invalid("partner_owed", "a line not being cancelled");

        const lines = order.lines.map((line) =>
          targets.includes(line.position)
            ? { ...line, state: "cancelled" as const, partner: null, parts: line.parts.map((part) => ({ ...part, state: "cancelled" as const, partner: null })) }
            : line,
        );
        const whole = lines.every((line) => line.state === "cancelled");
        const cancelled: StoredOrder = {
          ...order,
          lines,
          state: whole ? "cancelled" : order.state,
          cancelled: whole ? { at: new Date(now()).toISOString(), reason: body.reason } : order.cancelled,
          payment: body.refund
            ? {
                ...order.payment,
                refunded: fromCents(cents(order.payment.refunded) + cents(body.refund.amount)),
                refundable: fromCents(paidLeft - cents(body.refund.amount)),
              }
            : order.payment,
        };
        orders.set(id, cancelled);
        return { ok: true, body: view(cancelled) };
      });
    },

    ship(id: string, body: ShipBody, key: string | null): Answer<Order> {
      if (body.label && (body.courier !== undefined || body.tracking !== undefined))
        return invalid("label", "a bought label names its own courier and tracking");
      return once(key, { id, body }, () => {
        const order = orders.get(id);
        if (!order) return { ok: false, status: 404, detail: "Order not found" };
        if (order.state === "shipped" || order.state === "delivered")
          return { ok: false, status: 409, code: "order_already_shipped", detail: "Only a ready order can be shipped" };
        if (order.state !== "ready") return { ok: false, status: 409, code: "order_not_ready", detail: "Only a ready order can be shipped" };
        let shipping: StoredOrder["shipping"];
        const shippedAt = new Date(now()).toISOString();
        if (body.label) {
          if (!courierAccount)
            return { ok: false, status: 409, code: "courier_account_missing", detail: "No courier service is set up for this workspace" };
          if (failingLabels.delete(id))
            return { ok: false, status: 503, detail: "The courier service refused the label: address incomplete" };
          const tracking = `LBL${order.number}`;
          shipping = {
            ...order.shipping,
            courier: "DHL",
            tracking,
            shipped_at: shippedAt,
            label: {
              url: `https://labels.example.test/${order.number}.pdf`,
              carrier: "DHL",
              service: "Express",
              tracking,
              tracking_status: null,
              cost: "7.50",
              currency: "EUR",
            },
          };
        } else {
          shipping = { ...order.shipping, courier: body.courier ?? null, tracking: body.tracking ?? null, shipped_at: shippedAt };
        }
        const shipped: StoredOrder = { ...order, state: "shipped", shipping };
        orders.set(id, shipped);
        return { ok: true, body: view(shipped) };
      });
    },

    /** `POST /orders/ship` (erp-api `orders.controller.ts:63`): each entry as shipping it alone, one result each. */
    shipMany(body: ShipManyBody, key: string | null): Answer<{ results: BulkShipResult[] }> {
      if (body.orders.length < 1 || body.orders.length > 25) return invalid("orders", "must hold 1 to 25 orders");
      if (new Set(body.orders.map((entry) => entry.order_id)).size !== body.orders.length) return invalid("orders", "an order is listed twice");
      const input = JSON.stringify(body);
      const seen = key ? bulkKeys.get(key) : undefined;
      if (seen) {
        return seen.input === input
          ? { ok: true, body: seen.body }
          : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };
      }
      const results = body.orders.map(({ order_id, ...options }): BulkShipResult => {
        const answer = this.ship(order_id, options, null);
        if (answer.ok) return { order_id, result: "shipped", order: answer.body };
        const detail = answer.status === 400 ? answer.errors.map((e) => e.message).join("; ") : answer.detail;
        return { order_id, result: "failed", error: { status: answer.status, code: answer.status === 400 ? null : (answer.code ?? null), detail } };
      });
      const answer = { results };
      if (key) bulkKeys.set(key, { input, body: answer });
      return { ok: true, body: answer };
    },

    paidByHand(id: string, body: PaidByHandBody, key: string | null): Answer<Order> {
      if (body.reference.trim().length < 1 || body.reference.length > 200) return invalid("reference", "must be 1 to 200 characters");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.received_on)) return invalid("received_on", "must be a date");
      if (body.received_on > today()) return invalid("received_on", "must not be after today");
      return once(key, { id, body }, () => {
        const order = orders.get(id);
        if (!order) return { ok: false, status: 404, detail: "Order not found" };
        const open = ["awaiting_payment", "invoiced", "overdue"].includes(order.payment.state);
        if (order.state === "cancelled" || !open) return { ok: false, status: 409, detail: "Nothing to record a payment for" };
        const paid: StoredOrder = {
          ...order,
          state: order.state === "awaiting_payment" ? "in_production" : order.state,
          payment: {
            ...order.payment,
            state: "paid",
            paid: order.total,
            refundable: order.total,
            invoice: order.payment.invoice ? { ...order.payment.invoice, status: "paid" } : null,
          },
        };
        orders.set(id, paid);
        return { ok: true, body: view(paid) };
      });
    },

    /** The stored order and line made as this work order group, for the partner hand-over to change. */
    lineOfGroup(groupId: string) {
      for (const order of orders.values()) {
        const line = order.lines.find((candidate) => candidate.group_id === groupId);
        if (line) return { order, line };
      }
      return null;
    },

    /** Every order as staff see it, for search. */
    all(): Order[] {
      return [...orders.values()].map(view);
    },

    /** The courier service refuses this order's next label with a 503. */
    failNextLabel(id: string): void {
      failingLabels.add(id);
    },

    /** Whether the workspace has a courier account to buy labels from. */
    setCourierAccount(on: boolean): void {
      courierAccount = on;
    },

    /** What `/me` says as `workspace.labels_available`. */
    labelsAvailable(): boolean {
      return courierAccount;
    },
  };
}

export type OrdersStore = ReturnType<typeof createOrdersStore>;
