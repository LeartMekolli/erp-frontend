"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { noAnswer } from "@/components/auth/copy";
import { ListEnd } from "@/components/data/list-end";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { isApiProblem } from "@/lib/api/problem";
import type { Order } from "@/lib/api/schema-types";
import { can } from "@/lib/auth/permissions";
import { TAB_LABEL, workspaceToday } from "@/lib/orders/labels";
import { useOrdersList } from "@/lib/orders/queries";
import type { OrdersView } from "@/lib/orders/view";
import { OfflineError } from "@/lib/session/client-session";
import { cn } from "@/lib/utils";

import { OrderRow, orderHref } from "./order-row";
import { OrderRowMenu } from "./order-row-menu";
import type { ViewChange } from "./use-orders-view";
import { useRowKeys } from "./use-row-keys";

const CLEAR_FILTERS: ViewChange = { reason: null, payment: [], from: null, to: null, q: null };

const hasFilters = (view: OrdersView) =>
  Boolean(view.reason || view.payment.length || view.from || view.to || view.q);

const th = "px-3 pt-3 pb-2 text-left text-xs font-medium text-ink-2";

function Empty({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">{children}</div>;
}

/**
 * The Orders list for a view: a real table, 50 rows a page with more as you
 * scroll. Rows open their order; J/K/Enter/X work from the keyboard. The
 * selection is the page's, keyed by order id, so a refresh keeps it.
 */
export function OrdersTable({
  view,
  onChange,
  selected,
  onSelect,
  onShip,
  onRecordPayment,
}: {
  view: OrdersView;
  onChange: (change: ViewChange) => void;
  selected: ReadonlySet<string>;
  /** Ticks (`on`) or unticks these orders. */
  onSelect: (ids: string[], on: boolean) => void;
  onShip?: (order: Order) => void;
  onRecordPayment?: (order: Order) => void;
}) {
  const list = useOrdersList(view);
  const { data: me } = useMe();
  const router = useRouter();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Phones show the checkboxes only while selecting; from 768 px they always show.
  const [selecting, setSelecting] = useState(false);

  function toggle(id: string, on = !selected.has(id)) {
    onSelect([id], on);
  }

  const keys = useRowKeys({ open: (id) => router.push(orderHref({ id })), toggle: (id) => toggle(id) });

  if (!me) return null;

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <p role="status" className="sr-only">
          Loading orders…
        </p>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div key={n} aria-hidden className="h-12 animate-pulse rounded-lg bg-ground" />
        ))}
      </div>
    );
  }

  const orders = list.items;

  if (orders.length === 0 && list.isError) {
    const message =
      list.error instanceof OfflineError
        ? noAnswer()
        : (isApiProblem(list.error) && list.error.detail) || "Orders couldn't be loaded.";
    return (
      <Empty>
        <p className="text-sm text-ink">{message}</p>
        <Button variant="secondary" onClick={() => void list.refetch()}>
          Try again
        </Button>
      </Empty>
    );
  }

  if (orders.length === 0) {
    if (hasFilters(view)) {
      return (
        <Empty>
          <p className="text-sm text-ink">No orders match these filters.</p>
          <Button variant="secondary" onClick={() => onChange(CLEAR_FILTERS)}>
            Clear filters
          </Button>
        </Empty>
      );
    }
    if (view.tab === "needs") {
      return (
        <Empty>
          <p className="text-base font-semibold text-ink">Nothing needs you today</p>
          <Button variant="link" onClick={() => onChange({ tab: "all" })}>
            See all orders
          </Button>
        </Empty>
      );
    }
    if (view.tab === "all") {
      return (
        <Empty>
          <p className="text-base font-semibold text-ink">No orders yet</p>
          {can(me, "order.write") && (
            <Button asChild>
              <Link href="/orders/new">New order</Link>
            </Button>
          )}
        </Empty>
      );
    }
    return (
      <Empty>
        <p className="text-sm text-ink-2">{`No orders are ${TAB_LABEL[view.tab].toLowerCase()}.`}</p>
      </Empty>
    );
  }

  const today = workspaceToday(me.workspace.timezone);
  const activeId = orders.some((order) => order.id === focusedId) ? focusedId : orders[0]!.id;
  const selectedHere = orders.filter((order) => selected.has(order.id)).length;
  const all = selectedHere === orders.length ? true : selectedHere > 0 ? "indeterminate" : false;

  function selectAll(on: boolean) {
    onSelect(
      orders.map((order) => order.id),
      on,
    );
  }

  return (
    <div>
      <div className="flex justify-end px-3 pt-1 md:hidden">
        <Button type="button" variant="ghost" aria-pressed={selecting} onClick={() => setSelecting(!selecting)}>
          {selecting ? "Done" : "Select"}
        </Button>
      </div>
      <table className="w-full border-collapse" onKeyDown={keys.onKeyDown}>
        <caption className="sr-only">Orders</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(th, "w-10 pr-0", !selecting && "hidden md:table-cell")}>
              <span className="grid size-11 place-items-center md:size-6 pointer-coarse:size-11">
                <Checkbox checked={all} onCheckedChange={(checked) => selectAll(checked === true)} aria-label="Select all loaded orders" />
              </span>
            </th>
            <th scope="col" className={`${th} md:hidden`}>
              <span className="sr-only">Order</span>
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Order
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Customer
            </th>
            <th scope="col" className={`${th} hidden xl:table-cell`}>
              Lines
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Status
            </th>
            <th scope="col" className={`${th} hidden lg:table-cell`}>
              Payment
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Promised
            </th>
            <th scope="col" className={`${th} hidden text-right md:table-cell`}>
              Total
            </th>
            <th scope="col" className={`${th} w-12`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              today={today}
              selected={selected.has(order.id)}
              selecting={selecting}
              focusable={order.id === activeId}
              onSelect={(on) => toggle(order.id, on)}
              onOpen={() => router.push(orderHref(order))}
              onFocus={() => setFocusedId(order.id)}
              menu={<OrderRowMenu order={order} onShip={onShip} onRecordPayment={onRecordPayment} />}
            />
          ))}
        </tbody>
      </table>
      <div className="px-3">
        <ListEnd list={list} />
      </div>
    </div>
  );
}
