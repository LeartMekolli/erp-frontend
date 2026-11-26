"use client";

import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { orderHref, STATE_DOT } from "@/components/orders/order-row";
import type { Order } from "@/lib/api/schema-types";
import { useCustomerOrders } from "@/lib/customers/queries";
import { dayKey, formatDayMonth } from "@/lib/format/dates";
import { LOCALE } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { linesSummary, PAYMENT_LABEL, promisedText, STATE_LABEL, workspaceToday } from "@/lib/orders/labels";

import { dueText } from "./due";
import { Panel, PanelLoading } from "./panel";

/** Orders still on their way, whose promised day matters. */
const OPEN: readonly Order["state"][] = ["awaiting_payment", "in_production", "ready"];

const monthNames = new Map<string, Intl.DateTimeFormat>();

/** "November 2026": the month an order was placed in, in the workspace's zone. */
function monthName(iso: string, timeZone: string): string {
  let formatter = monthNames.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone });
    monthNames.set(timeZone, formatter);
  }
  return formatter.format(new Date(iso));
}

/** The orders under one heading per month placed, in the order erp-api gave them; a month spread over two pages keeps one heading. */
export function byMonth(orders: Order[], timeZone: string): { key: string; name: string; orders: Order[] }[] {
  const months: { key: string; name: string; orders: Order[] }[] = [];
  for (const order of orders) {
    const key = dayKey(order.placed_at, timeZone).slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.orders.push(order);
    else months.push({ key, name: monthName(order.placed_at, timeZone), orders: [order] });
  }
  return months;
}

/** How the order is being paid: "Invoice overdue since 3 Nov" in late ink, "Invoiced · due 26 Dec", or the payment's word. */
function PaymentLine({ order }: { order: Order }) {
  const { state, invoice } = order.payment;
  if (state === "overdue") {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-late-ink">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-late" />
        {invoice ? `Invoice overdue since ${dueText(invoice.due_on)}` : "Invoice overdue"}
      </span>
    );
  }
  if (state === "invoiced" && invoice) return <span className="text-caption text-ink-2">Invoiced · due {dueText(invoice.due_on)}</span>;
  const label = PAYMENT_LABEL[state];
  return label ? <span className="text-caption text-ink-2">{label}</span> : null;
}

function OrderLine({ order, today, timeZone }: { order: Order; today: string; timeZone: string }) {
  const { money } = useFormat();
  const late = order.needs.includes("late");
  const cancelled = order.state === "cancelled";
  return (
    <li className="border-t border-line first:border-t-transparent">
      <Link
        href={orderHref(order)}
        className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3.5 gap-y-1 rounded-xl px-2 py-2.5 hover:bg-panel-soft focus-visible:outline-2 focus-visible:outline-violet md:grid-cols-[minmax(0,1fr)_170px_196px] md:items-center"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{linesSummary(order.lines)}</span>
          <span className="block text-caption text-ink-2 tabular-nums">
            #{order.number} · placed {formatDayMonth(order.placed_at, timeZone)}
          </span>
        </span>
        {/* On a phone the state and promised day share a line, and wrap under each other when it's too narrow. */}
        <span className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 md:col-start-auto md:row-start-auto md:flex-col md:flex-nowrap md:gap-0.5">
          <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", late ? "text-late-ink" : cancelled ? "text-ink-2" : "text-ink")}>
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", late ? "bg-late" : STATE_DOT[order.state])} />
            {STATE_LABEL[order.state]}
          </span>
          {OPEN.includes(order.state) && (
            <span className={cn("text-caption md:whitespace-nowrap", late ? "font-semibold text-late-ink" : "text-ink-2")}>
              Promised {promisedText(order.promised_on, today, late)}
            </span>
          )}
        </span>
        <span className="row-span-2 flex flex-col items-end gap-0.5 text-right md:row-span-1">
          <span className={cn("text-sm font-medium whitespace-nowrap tabular-nums", cancelled ? "text-ink-2" : "text-ink")}>{money(order.total, order.currency)}</span>
          <PaymentLine order={order} />
        </span>
      </Link>
    </li>
  );
}

/** The customer's orders, newest placed first, under month headings, 10 at a time. Staff with `order.read` only. */
export function OrdersPanel({ customerId, empty }: { customerId: string; empty?: ReactNode }) {
  const list = useCustomerOrders(customerId, true);
  const { timeZone } = useFormat();
  const today = workspaceToday(timeZone);

  return (
    <Panel title="Orders">
      {list.isPending ? (
        <PanelLoading label="Loading the orders" />
      ) : list.isError && list.items.length === 0 ? (
        <LoadFailure error={list.error} fallback="The orders couldn't be loaded." onRetry={() => void list.refetch()} />
      ) : list.items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-sm text-ink-2">No orders yet</p>
          {empty}
        </div>
      ) : (
        <>
          {byMonth(list.items, timeZone).map((month) => (
            <section key={month.key} aria-label={month.name}>
              <h3 className="pt-3 pb-1.5 text-caption font-semibold text-ink-2 first:pt-0">{month.name}</h3>
              <ul>
                {month.orders.map((order) => (
                  <OrderLine key={order.id} order={order} today={today} timeZone={timeZone} />
                ))}
              </ul>
            </section>
          ))}
          <ListEnd list={list} auto={false} />
        </>
      )}
    </Panel>
  );
}
