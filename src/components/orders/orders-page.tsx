"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";

import { Freshness } from "@/components/data/freshness";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/api/schema-types";
import { can } from "@/lib/auth/permissions";
import { useFormat } from "@/lib/format/use-format";
import { useOrdersList } from "@/lib/orders/queries";
import { viewKey } from "@/lib/orders/view";

import { OrdersTable } from "./orders-table";
import { BulkShipDialog } from "./bulk-ship-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { SelectionBar } from "./selection-bar";
import { ShipDialog } from "./ship-dialog";
import { Tiles } from "./tiles";
import { Toolbar } from "./toolbar";
import { useOrdersView } from "./use-orders-view";
import { useSelection } from "./use-selection";

/** `/orders`: what needs staff today, then every order by tab, filter and search. */
export function OrdersPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "order.read")) notFound();
  return <Orders canCreate={can(me, "order.write")} canShipOrders={can(me, "order.ship")} />;
}

function Orders({ canCreate, canShipOrders }: { canCreate: boolean; canShipOrders: boolean }) {
  const [view, setView] = useOrdersView();
  const selection = useSelection(viewKey(view));
  const [shipping, setShipping] = useState<Order | null>(null);
  const [bulkShipping, setBulkShipping] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  // What the last action did, announced politely.
  const [notice, setNotice] = useState<string | null>(null);
  const { date } = useFormat();
  const [today] = useState(() => new Date().toISOString());
  // The table's query, shared through the cache: Freshness reports on it.
  const list = useOrdersList(view);
  const selectedOrders = list.items.filter((order) => selection.ids.has(order.id));

  return (
    <>
      <div className="flex items-center gap-3 pt-1">
        <h1 className="text-title font-semibold">Orders</h1>
        <p className="hidden text-sm text-ink-2 sm:block">{date(today)}</p>
        {canCreate && (
          <Button asChild className="ml-auto hidden rounded-full md:inline-flex">
            <Link href="/orders/new">
              <Plus aria-hidden />
              New order
            </Link>
          </Button>
        )}
      </div>

      <Tiles onPickReason={(reason) => setView({ tab: "needs", reason })} />

      {/* On phones the selection bar is fixed to the screen's bottom: room for it under the last row. */}
      <section id="order-list" aria-label="Order list" className={`flex flex-col rounded-[20px] bg-card ${selectedOrders.length ? "pb-20 md:pb-0" : ""}`}>
        <Toolbar view={view} onChange={setView} />
        <div className="flex items-center justify-between gap-3 px-4 pt-2">
          <p role="status" className="text-caption font-medium text-ink">
            {notice}
          </p>
          {list.dataUpdatedAt > 0 && <Freshness query={list} />}
        </div>
        <OrdersTable
          view={view}
          onChange={setView}
          selected={selection.ids}
          onSelect={selection.setAll}
          onShip={(order) => {
            setNotice(null);
            setShipping(order);
          }}
          onRecordPayment={(order) => {
            setNotice(null);
            setPaying(order);
          }}
        />
        <SelectionBar
          orders={selectedOrders}
          canShipOrders={canShipOrders}
          onShip={() => {
            setNotice(null);
            setBulkShipping(true);
          }}
          onClear={selection.clear}
        />
      </section>

      <BulkShipDialog
        orders={selectedOrders}
        open={bulkShipping}
        onOpenChange={setBulkShipping}
        onShipped={(ids) => selection.setAll(ids, false)}
      />

      <ShipDialog
        order={shipping}
        open={shipping !== null}
        onOpenChange={(open) => {
          if (!open) setShipping(null);
        }}
        onShipped={setNotice}
      />
      <RecordPaymentDialog
        order={paying}
        open={paying !== null}
        onOpenChange={(open) => {
          if (!open) setPaying(null);
        }}
        onRecorded={setNotice}
      />
    </>
  );
}
