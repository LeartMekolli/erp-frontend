"use client";

import { Button } from "@/components/ui/button";
import type { Order } from "@/lib/api/schema-types";

import { canShip } from "./order-row-menu";

/**
 * What to do with the ticked orders: a panel stuck to the bottom of the list,
 * full width along the screen's bottom edge on phones. Ship counts only the
 * ready ones and says how many it skips.
 */
export function SelectionBar({
  orders,
  canShipOrders,
  onShip,
  onClear,
}: {
  /** The ticked orders, as loaded. */
  orders: readonly Order[];
  canShipOrders: boolean;
  onShip: () => void;
  onClear: () => void;
}) {
  if (orders.length === 0) return null;
  const ready = orders.filter(canShip).length;
  const notReady = orders.length - ready;

  return (
    <div
      role="region"
      aria-label="Selected orders"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:sticky md:bottom-4 md:mx-3 md:mb-3 md:rounded-2xl md:border md:shadow-lg"
    >
      <p className="mr-auto text-sm font-semibold text-ink tabular-nums">{`${orders.length} selected`}</p>
      <Button type="button" variant="outline" onClick={onClear}>
        Clear
      </Button>
      <Button type="button" onClick={onShip} disabled={ready === 0 || !canShipOrders}>
        {`Ship ${ready}${notReady ? ` (${notReady} not ready)` : ""}`}
      </Button>
    </div>
  );
}
