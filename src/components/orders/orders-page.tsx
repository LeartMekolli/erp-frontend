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

import { OrdersTable } from "./orders-table";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ShipDialog } from "./ship-dialog";
import { Tiles } from "./tiles";
import { Toolbar } from "./toolbar";
import { useOrdersView } from "./use-orders-view";

/** `/orders`: what needs staff today, then every order by tab, filter and search. */
export function OrdersPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "order.read")) notFound();
  return <Orders canCreate={can(me, "order.write")} />;
}

function Orders({ canCreate }: { canCreate: boolean }) {
  const [view, setView] = useOrdersView();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [shipping, setShipping] = useState<Order | null>(null);
  const [paying, setPaying] = useState<Order | null>(null);
  // What the last action did, announced politely.
  const [notice, setNotice] = useState<string | null>(null);
  const { date } = useFormat();
  const [today] = useState(() => new Date().toISOString());
  // The table's query, shared through the cache: Freshness reports on it.
  const list = useOrdersList(view);

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

      <section aria-label="Order list" className="flex flex-col rounded-[20px] bg-card">
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
          selected={selected}
          onSelect={setSelected}
          onShip={(order) => {
            setNotice(null);
            setShipping(order);
          }}
          onRecordPayment={(order) => {
            setNotice(null);
            setPaying(order);
          }}
        />
      </section>

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
