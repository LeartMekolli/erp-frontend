"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";

import { Freshness } from "@/components/data/freshness";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { useFormat } from "@/lib/format/use-format";
import { useOrdersList } from "@/lib/orders/queries";

import { OrdersTable } from "./orders-table";
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
        <div className="flex justify-end px-4 pt-2">
          {list.dataUpdatedAt > 0 && <Freshness query={list} />}
        </div>
        <OrdersTable view={view} onChange={setView} selected={selected} onSelect={setSelected} />
      </section>
    </>
  );
}
