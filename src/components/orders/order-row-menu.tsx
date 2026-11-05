"use client";

import { Ellipsis } from "lucide-react";
import { useRef, useState } from "react";

import { useMe } from "@/components/session/session-gate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Order } from "@/lib/api/schema-types";
import { can } from "@/lib/auth/permissions";
import { useMediaQuery } from "@/lib/use-media-query";

/** erp-api ships an order once every line is ready (`orders.service.ts:514`). */
export const canShip = (order: Order) => order.state === "ready";

/** erp-api records a payment only while one is due (`checkout.controller.ts:59-60`). */
export const canRecordPayment = (order: Order) =>
  ["awaiting_payment", "invoiced", "overdue"].includes(order.payment.state);

interface Action {
  label: string;
  /** Why it can't be done now; null when it can. */
  reason: string | null;
  run: () => void;
}

const CANCEL = { label: "Cancel on the order page", reason: "Cancelling needs the order's lines and partners." };

const trigger =
  "grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink focus-visible:outline-2 focus-visible:outline-violet md:size-8 pointer-coarse:size-11";

/**
 * An order's actions (spec §6.1): Ship, Record payment, then Cancel, which
 * waits for the order page. Each shows only with its permission and is
 * disabled, with the reason, when the order's state doesn't allow it. A
 * dropdown from 768 px, a bottom sheet below. An action without its handler is left out.
 */
export function OrderRowMenu({
  order,
  onShip,
  onRecordPayment,
}: {
  order: Order;
  onShip?: (order: Order) => void;
  onRecordPayment?: (order: Order) => void;
}) {
  const { data: me } = useMe();
  const wide = useMediaQuery("(min-width: 768px)");
  const [sheetOpen, setSheetOpen] = useState(false);
  // A chosen action opens a dialog; focus mustn't go back to this button over it.
  const chosen = useRef(false);
  if (!me) return null;

  const actions: Action[] = [];
  if (onShip && can(me, "order.ship"))
    actions.push({ label: "Ship", reason: canShip(order) ? null : "Only ready orders can ship", run: () => onShip(order) });
  if (onRecordPayment && can(me, "payment.write"))
    actions.push({
      label: "Record payment",
      reason: canRecordPayment(order) ? null : "Nothing to collect on this order",
      run: () => onRecordPayment(order),
    });
  const showCancel = can(me, "order.write");
  if (actions.length === 0 && !showCancel) return null;

  const name = `Actions for order #${order.number}`;
  const icon = <Ellipsis aria-hidden className="size-4" />;

  if (!wide) {
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger aria-label={name} className={trigger}>
          {icon}
        </SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          className="gap-1 rounded-t-2xl px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="px-2 pb-2 text-sm font-semibold text-ink">{`Order #${order.number}`}</SheetTitle>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.reason !== null}
              onClick={() => {
                setSheetOpen(false);
                action.run();
              }}
              className="flex min-h-12 flex-col items-start justify-center rounded-lg px-2 text-left text-sm font-medium text-ink hover:bg-ground disabled:text-ink-2"
            >
              {action.label}
              {action.reason && <span className="text-caption font-normal text-ink-2">{action.reason}</span>}
            </button>
          ))}
          {showCancel && (
            <button
              type="button"
              disabled
              className="flex min-h-12 flex-col items-start justify-center rounded-lg border-t border-line px-2 text-left text-sm font-medium text-ink-2"
            >
              {CANCEL.label}
              <span className="text-caption font-normal">{CANCEL.reason}</span>
            </button>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) chosen.current = false;
      }}
    >
      <DropdownMenuTrigger aria-label={name} className={trigger}>
        {icon}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 rounded-xl p-1.5"
        onCloseAutoFocus={(event) => {
          if (chosen.current) event.preventDefault();
        }}
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.reason !== null}
            onSelect={() => {
              chosen.current = true;
              action.run();
            }}
            className="min-h-9 flex-col items-start gap-0 px-2 py-1.5"
          >
            <span className="font-medium">{action.label}</span>
            {action.reason && <span className="text-caption text-ink-2">{action.reason}</span>}
          </DropdownMenuItem>
        ))}
        {showCancel && (
          <>
            {actions.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem disabled className="min-h-9 flex-col items-start gap-0 px-2 py-1.5">
              <span className="font-medium">{CANCEL.label}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
