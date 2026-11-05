/**
 * The fake erp-api's orders: the staff list with its filters, the tab counts,
 * shipping and payments recorded by hand. It keeps the rules the Orders screen
 * depends on (erp-api `src/modules/orders/`): the needs-you reasons
 * (`needs.ts:27-45`), filters combined with AND, a cursor tied to its sort,
 * ship only when ready, and one-time `Idempotency-Key`s.
 */

import type {
  NeedsReason,
  Order,
  OrderCounts,
  OrderSort,
  OrderState,
  PaidByHandBody,
  PaymentState,
  ShipBody,
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

/** What a route answers: a body, field errors (400), or a problem with its detail. */
export type Answer<T> =
  | { ok: true; body: T }
  | { ok: false; status: 400; errors: FieldError[] }
  | { ok: false; status: 403 | 404 | 409 | 503; detail: string };

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

export function createOrdersStore(now: () => number) {
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const orders = new Map(seedOrders(today(), now()).map((order) => [order.id, order]));
  const keys = new Map<string, { input: string; body: Order }>();
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
        : { ok: false, status: 409, detail: "Idempotency key reused with a different request" };
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
        },
      };
    },

    ship(id: string, body: ShipBody, key: string | null): Answer<Order> {
      if (body.label && (body.courier !== undefined || body.tracking !== undefined))
        return invalid("label", "a bought label names its own courier and tracking");
      return once(key, { id, body }, () => {
        const order = orders.get(id);
        if (!order) return { ok: false, status: 404, detail: "Order not found" };
        if (order.state === "shipped" || order.state === "delivered") return { ok: false, status: 409, detail: "Order already shipped" };
        if (order.state !== "ready") return { ok: false, status: 409, detail: "Order is not ready to ship" };
        let shipping: StoredOrder["shipping"];
        const shippedAt = new Date(now()).toISOString();
        if (body.label) {
          if (!courierAccount) return { ok: false, status: 409, detail: "No courier account" };
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
            invoice: order.payment.invoice ? { ...order.payment.invoice, status: "paid" } : null,
          },
        };
        orders.set(id, paid);
        return { ok: true, body: view(paid) };
      });
    },

    /** The courier service refuses this order's next label with a 503. */
    failNextLabel(id: string): void {
      failingLabels.add(id);
    },

    /** Whether the workspace has a courier account to buy labels from. */
    setCourierAccount(on: boolean): void {
      courierAccount = on;
    },
  };
}

export type OrdersStore = ReturnType<typeof createOrdersStore>;
