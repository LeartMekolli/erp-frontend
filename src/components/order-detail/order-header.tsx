"use client";

import { cn } from "cn";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CustomerInitials } from "@/components/orders/customer-initials";
import { canRecordPayment, canShip } from "@/components/orders/order-row-menu";
import { STATE_DOT } from "@/components/orders/order-row";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/api/schema-types";
import { can } from "@/lib/auth/permissions";
import { useFormat } from "@/lib/format/use-format";
import { NEEDS_LABEL, PAYMENT_LABEL, STATE_LABEL, promisedText, workspaceToday } from "@/lib/orders/labels";

/** Ship is on offer while an order is being made, and goes once it's out of the door. */
const SHIP_SHOWN: Order["state"][] = ["awaiting_payment", "in_production", "ready"];

/** The order at a glance: who, what state, when it's promised, and what can be done next. */
export function OrderHeader({
  order,
  onShip,
  onRecordPayment,
}: {
  order: Order;
  onShip: () => void;
  onRecordPayment: () => void;
}) {
  const { data: me } = useMe();
  const { date, money, timeZone } = useFormat();
  const [today] = useState(() => workspaceToday(timeZone));
  const late = order.needs.includes("late");
  const placed =
    order.channel === "portal"
      ? `Placed ${date(order.placed_at)} through the customer site`
      : `Placed ${date(order.placed_at)} by ${order.placed_by.name}`;
  const paymentLabel = PAYMENT_LABEL[order.payment.state];

  return (
    <header className="flex flex-col gap-3 pt-1">
      <Link href="/orders" className="inline-flex min-h-11 items-center gap-1 self-start font-medium text-ink-2 hover:text-ink md:min-h-0">
        <ChevronLeft aria-hidden className="size-4" />
        Orders
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-title font-semibold tabular-nums">#{order.number}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-2">
            <span className="inline-flex items-center gap-2 font-medium text-ink">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", late ? "bg-late" : STATE_DOT[order.state])} />
              {[STATE_LABEL[order.state], ...order.needs.map((reason) => NEEDS_LABEL[reason])].join(" · ")}
            </span>
            <span className="inline-flex min-w-0 items-center gap-2">
              <CustomerInitials customer={order.customer} />
              <span className="truncate font-semibold text-ink" title={order.customer.name}>
                {order.customer.name}
              </span>
            </span>
            <span className={cn(late && "font-semibold text-late")}>
              Promised {promisedText(order.promised_on, today, late)}
            </span>
            {order.delivery_speed && <span>{order.delivery_speed} speed</span>}
            <span>{placed}</span>
            {/* The side column drops below the lines under 1280 px: what's owed stays up here. */}
            <span className="font-medium text-ink tabular-nums xl:hidden">
              {money(order.total, order.currency)}
              {paymentLabel && ` · ${paymentLabel}`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(me, "payment.write") && canRecordPayment(order) && (
            <Button variant="secondary" className="rounded-full" onClick={onRecordPayment}>
              Record payment
            </Button>
          )}
          {can(me, "order.ship") && SHIP_SHOWN.includes(order.state) && (
            <Button
              className="rounded-full"
              disabled={!canShip(order)}
              title={canShip(order) ? undefined : "Only ready orders can ship"}
              onClick={onShip}
            >
              Ship
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/** Why and when a cancelled order was cancelled. */
export function CancelledBanner({ cancelled }: { cancelled: NonNullable<Order["cancelled"]> }) {
  const { date } = useFormat();
  return (
    <p className="rounded-2xl bg-card px-5 py-3 text-sm text-ink">
      <span className="font-semibold">Cancelled {date(cancelled.at)}</span>
      {cancelled.reason && <span className="text-ink-2"> · {cancelled.reason}</span>}
    </p>
  );
}
