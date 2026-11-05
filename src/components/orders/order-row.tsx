"use client";

import { cn } from "cn";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import type { Order, OrderState } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";
import { NEEDS_LABEL, PAYMENT_LABEL, STATE_LABEL, linesSummary, promisedText } from "@/lib/orders/labels";

import { CustomerInitials } from "./customer-initials";

const STATE_DOT: Record<OrderState, string> = {
  awaiting_payment: "bg-collect",
  in_production: "bg-violet",
  ready: "bg-ship",
  shipped: "bg-ink-2",
  delivered: "bg-ship",
  cancelled: "bg-line",
};

/** Clicks on these do their own thing, never open the order. */
const OWN_CLICK = "a, button, input, label, [role='checkbox'], [role='menuitem']";

export const orderHref = (order: Pick<Order, "id">) => `/orders/${order.id}`;

function Status({ order }: { order: Order }) {
  const late = order.needs.includes("late");
  const reason = order.needs[0];
  return (
    <span className={cn("inline-flex items-center gap-2 font-medium", late ? "text-late" : "text-ink")}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", late ? "bg-late" : STATE_DOT[order.state])} />
      {reason ? `${STATE_LABEL[order.state]} · ${NEEDS_LABEL[reason]}` : STATE_LABEL[order.state]}
    </span>
  );
}

function Payment({ order }: { order: Order }) {
  const label = PAYMENT_LABEL[order.payment.state];
  if (!label) return null;
  return <span className={order.payment.state === "overdue" ? "font-semibold text-late" : "text-ink-2"}>{label}</span>;
}

function Cell({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("border-t border-line px-3 py-2.5 align-middle", className)}>{children}</td>;
}

/**
 * One order in the list. From 1280 px every column; at 1024 Lines sits under
 * the customer; at 768 Payment sits under Status; below that, a three-line
 * row: customer and total, number and status, promised day.
 */
export function OrderRow({
  order,
  today,
  selected,
  focusable,
  onSelect,
  onOpen,
  onFocus,
}: {
  order: Order;
  today: string;
  selected: boolean;
  focusable: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
  onFocus: () => void;
}) {
  const late = order.needs.includes("late");
  const promised = promisedText(order.promised_on, today, late);
  const total = formatMoney(order.total, order.currency);
  const lines = linesSummary(order.lines);

  function click(event: MouseEvent<HTMLTableRowElement>) {
    if ((event.target as HTMLElement).closest(OWN_CLICK)) return;
    onOpen();
  }

  return (
    <tr
      data-row-id={order.id}
      tabIndex={focusable ? 0 : -1}
      onClick={click}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocus();
      }}
      className={cn(
        "cursor-pointer text-sm outline-none hover:bg-panel-soft focus-visible:bg-panel-soft focus-visible:shadow-[inset_3px_0_0_var(--color-violet)]",
        selected && "bg-lilac/50 hover:bg-lilac/60",
      )}
    >
      <Cell className="w-10 pr-0">
        <span className="grid size-11 place-items-center md:size-6 pointer-coarse:size-11">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect(checked === true)}
            aria-label={`Select order #${order.number}`}
          />
        </span>
      </Cell>

      {/* Phone: three lines in one cell. */}
      <Cell className="md:hidden">
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between gap-3">
            <span className="truncate font-semibold text-ink" title={order.customer.name}>
              {order.customer.name}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{total}</span>
          </span>
          <span className="flex items-center gap-2 text-caption">
            <span className="text-ink-2 tabular-nums">#{order.number}</span>
            <Status order={order} />
          </span>
          <span className={cn("text-caption", late ? "font-semibold text-late" : "text-ink-2")}>{promised}</span>
        </span>
      </Cell>

      <Cell className="hidden w-20 md:table-cell">
        <Link href={orderHref(order)} className="text-ink-2 tabular-nums hover:text-ink hover:underline">
          #{order.number}
        </Link>
      </Cell>
      <Cell className="hidden max-w-64 md:table-cell">
        <span className="flex items-center gap-2.5">
          <CustomerInitials customer={order.customer} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-ink" title={order.customer.name}>
              {order.customer.name}
            </span>
            <span className="hidden truncate text-caption text-ink-2 lg:block xl:hidden">{lines}</span>
          </span>
        </span>
      </Cell>
      <Cell className="hidden text-ink-2 xl:table-cell">{lines}</Cell>
      <Cell className="hidden md:table-cell">
        <span className="flex flex-col gap-0.5">
          <Status order={order} />
          <span className="text-caption lg:hidden">
            <Payment order={order} />
          </span>
        </span>
      </Cell>
      <Cell className="hidden lg:table-cell">
        <Payment order={order} />
      </Cell>
      <Cell className={cn("hidden whitespace-nowrap md:table-cell", late ? "font-semibold text-late" : "text-ink")}>{promised}</Cell>
      <Cell className="hidden text-right font-medium whitespace-nowrap tabular-nums md:table-cell">{total}</Cell>
    </tr>
  );
}
