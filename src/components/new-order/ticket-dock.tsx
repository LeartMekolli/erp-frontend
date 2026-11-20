"use client";

import type { Ref } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/lib/format/use-format";
import { useOnline } from "@/lib/query/use-online";

import { COPY } from "./copy";
import { Hold, MainButton, Status } from "./order-ticket";
import type { Checkout } from "./use-checkout";
import type { Price } from "./use-price";

/**
 * The ticket below 1280px: a bar fixed to the bottom with the total (or "No price yet"), how long the
 * price holds, See details, which opens the whole ticket in a sheet, and the main button full width.
 * The page measures it (`ref`) and pads its bottom by that much, so the last panel is never hidden;
 * `mainRef` and `detailsRef` let it put focus back here when the sheet closes.
 */
export function TicketDock({
  checkout,
  price,
  onDetails,
  ref,
  mainRef,
  detailsRef,
}: {
  checkout: Checkout;
  price: Price;
  onDetails: () => void;
  ref?: Ref<HTMLElement>;
  mainRef?: Ref<HTMLButtonElement>;
  detailsRef?: Ref<HTMLButtonElement>;
}) {
  const format = useFormat();
  const online = useOnline();
  const { total } = checkout;
  const quote = price.shown?.quote ?? null;

  // A landmark named as the wide layout's aside is, so the ticket is found the same way at every size.
  return (
    <section
      ref={ref}
      aria-label={COPY.ticket.label}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-3 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(22_20_28/0.12)] sm:px-5"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {total !== null ? (
            <>
              <p className="text-caption text-ink-2">{total.label}</p>
              <p className="text-xl font-semibold text-ink tabular-nums">{total.amount}</p>
            </>
          ) : price.stale !== null ? (
            <>
              <p className="text-xl font-semibold text-ink-2 tabular-nums line-through">{format.money(price.stale.total, price.stale.currency)}</p>
              <Status dot="bg-collect" small>
                {COPY.ticket.changed}
              </Status>
            </>
          ) : (
            <p className="text-sm font-medium text-ink-2">{COPY.ticket.noPrice}</p>
          )}
          {quote !== null && <Hold quote={quote} small />}
        </div>
        <Button ref={detailsRef} type="button" variant="outline" className="min-h-11 shrink-0 rounded-full" onClick={onDetails}>
          {COPY.ticket.details}
        </Button>
      </div>
      {online && price.error && <FormMessage tone="error">{price.error}</FormMessage>}
      <MainButton main={checkout.main} className="w-full" buttonRef={mainRef} />
    </section>
  );
}
