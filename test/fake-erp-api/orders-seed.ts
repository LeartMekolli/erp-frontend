/**
 * The fake erp-api's orders: fourteen orders whose promised days sit around
 * today, so every tab and every needs-you reason has something in it.
 * `needs` is never stored; the store works it out on each read.
 */

import type { Order, OrderState, PaymentState } from "../../src/lib/api/schema-types";

export type StoredOrder = Omit<Order, "needs">;

const CUSTOMERS = {
  fieldnote: { id: "11111111-0000-4000-8000-000000000001", name: "Fieldnote Studio" },
  luna: { id: "11111111-0000-4000-8000-000000000002", name: "Luna Jewels" },
  orbit: { id: "11111111-0000-4000-8000-000000000003", name: "Orbit Dental" },
  mira: { id: "11111111-0000-4000-8000-000000000004", name: "Mira Studio" },
  kestrel: { id: "11111111-0000-4000-8000-000000000005", name: "Kestrel Labs" },
  halden: { id: "11111111-0000-4000-8000-000000000006", name: "Halden Audio" },
  pinewood: { id: "11111111-0000-4000-8000-000000000007", name: "Pinewood Instruments" },
  // 40 characters: the longest name the brief plans for.
  northside: { id: "11111111-0000-4000-8000-000000000008", name: "Northside Architecture Models and Protos" },
  brightline: { id: "11111111-0000-4000-8000-000000000009", name: "Brightline Optics" },
} as const;

type Customer = (typeof CUSTOMERS)[keyof typeof CUSTOMERS];

interface Line {
  product: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

interface Row {
  number: number;
  customer: Customer;
  state: OrderState;
  payment: PaymentState;
  /** Days from today. */
  promised: number;
  lines: Line[];
  total: string;
}

const ROWS: Row[] = [
  { number: 1041, customer: CUSTOMERS.fieldnote, state: "in_production", payment: "paid", promised: -2, lines: [{ product: "Bracket", quantity: 40, unitPrice: "26.75", total: "1070.00" }], total: "1284.00" },
  { number: 1042, customer: CUSTOMERS.luna, state: "ready", payment: "paid", promised: -1, lines: [{ product: "Earring", quantity: 24, unitPrice: "30.00", total: "720.00" }], total: "864.00" },
  { number: 1043, customer: CUSTOMERS.orbit, state: "ready", payment: "invoiced", promised: 1, lines: [{ product: "Crown model", quantity: 6, unitPrice: "58.08", total: "348.50" }], total: "418.20" },
  { number: 1044, customer: CUSTOMERS.mira, state: "ready", payment: "paid", promised: 2, lines: [{ product: "Pendant", quantity: 2, unitPrice: "1558.33", total: "3116.67" }], total: "3740.00" },
  { number: 1045, customer: CUSTOMERS.kestrel, state: "awaiting_payment", payment: "awaiting_payment", promised: 6, lines: [{ product: "Housing assembly", quantity: 1, unitPrice: "912.92", total: "912.92" }], total: "1095.50" },
  { number: 1046, customer: CUSTOMERS.halden, state: "awaiting_payment", payment: "awaiting_payment", promised: 8, lines: [{ product: "Knob", quantity: 200, unitPrice: "2.55", total: "510.00" }], total: "612.00" },
  { number: 1047, customer: CUSTOMERS.pinewood, state: "in_production", payment: "overdue", promised: 10, lines: [{ product: "Tuning peg", quantity: 60, unitPrice: "4.10", total: "246.00" }], total: "295.20" },
  { number: 1048, customer: CUSTOMERS.luna, state: "in_production", payment: "paid", promised: 0, lines: [{ product: "Ring band", quantity: 12, unitPrice: "202.53", total: "2430.33" }], total: "2916.40" },
  {
    number: 1049,
    customer: CUSTOMERS.northside,
    state: "in_production",
    payment: "paid",
    promised: 1,
    lines: [
      { product: "Facade panel", quantity: 4, unitPrice: "40.00", total: "160.00" },
      { product: "Stair core", quantity: 1, unitPrice: "95.00", total: "95.00" },
      { product: "Roof truss", quantity: 8, unitPrice: "12.50", total: "100.00" },
    ],
    total: "426.00",
  },
  { number: 1050, customer: CUSTOMERS.brightline, state: "in_production", payment: "invoiced", promised: 1, lines: [{ product: "Lens mount", quantity: 500, unitPrice: "166.67", total: "83333.33" }], total: "99999.99" },
  { number: 1051, customer: CUSTOMERS.orbit, state: "shipped", payment: "paid", promised: -3, lines: [{ product: "Aligner tray", quantity: 10, unitPrice: "15.00", total: "150.00" }], total: "180.00" },
  { number: 1052, customer: CUSTOMERS.mira, state: "shipped", payment: "paid", promised: -1, lines: [{ product: "Brooch", quantity: 3, unitPrice: "120.00", total: "360.00" }], total: "432.00" },
  { number: 1053, customer: CUSTOMERS.kestrel, state: "delivered", payment: "paid", promised: -7, lines: [{ product: "Sensor cap", quantity: 50, unitPrice: "3.00", total: "150.00" }], total: "180.00" },
  { number: 1054, customer: CUSTOMERS.halden, state: "cancelled", payment: "refunded", promised: 4, lines: [{ product: "Fader knob", quantity: 100, unitPrice: "1.80", total: "180.00" }], total: "216.00" },
];

/** `YYYY-MM-DD` plus whole days, in UTC. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const LINE_STATE: Record<OrderState, Order["lines"][number]["state"]> = {
  awaiting_payment: "in_production",
  in_production: "in_production",
  ready: "ready",
  shipped: "ready",
  delivered: "ready",
  cancelled: "cancelled",
};

/** Every seeded order, promised relative to `today` and placed an hour apart before `now`, newest last. */
export function seedOrders(today: string, now: number): StoredOrder[] {
  return ROWS.map((row, index) => {
    const placedAt = new Date(now - (ROWS.length - index) * 3_600_000).toISOString();
    const shipped = row.state === "shipped" || row.state === "delivered";
    return {
      id: uuid("22222222", row.number),
      number: row.number,
      customer: { ...row.customer },
      channel: "staff",
      state: row.state,
      promised_on: addDays(today, row.promised),
      delivery_speed: "standard",
      address: { name: row.customer.name, line1: "1 Harbour Road", city: "Leeds", postal_code: "LS1 4AB", country: "GB" },
      shipping: {
        method: { key: "standard", name: "Standard courier" },
        price: "12.00",
        courier: shipped ? "DHL" : null,
        tracking: shipped ? `JD${row.number}` : null,
        shipped_at: shipped ? placedAt : null,
        delivered_at: row.state === "delivered" ? placedAt : null,
        label: null,
      },
      lines: row.lines.map((line, position) => ({
        id: uuid("33333333", row.number * 10 + position),
        position,
        product: { id: uuid("44444444", row.number * 10 + position), name: line.product },
        quantity: line.quantity,
        unit_price: line.unitPrice,
        total: line.total,
        state: LINE_STATE[row.state],
        group_id: null,
        partner: null,
        parts: [],
      })),
      lines_total: row.lines.length === 1 ? row.lines[0]!.total : "355.00",
      tax: { percent: "20.00", amount: "0.00" },
      total: row.total,
      currency: "EUR",
      note: null,
      placed_at: placedAt,
      payment: {
        terms: row.payment === "invoiced" || row.payment === "overdue" ? "pay_later" : "pay_first",
        state: row.payment,
        pay_by: null,
        held_for_credit: false,
        released: null,
        paid: row.payment === "paid" ? row.total : "0.00",
        refunded: row.payment === "refunded" ? row.total : "0.00",
        pay_url: null,
        invoice:
          row.payment === "invoiced" || row.payment === "overdue"
            ? { url: `https://invoices.example.test/${row.number}.pdf`, due_on: addDays(today, row.payment === "overdue" ? -5 : 20), status: "open", credited: "0.00" }
            : null,
      },
    };
  });
}
