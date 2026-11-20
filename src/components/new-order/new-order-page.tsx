"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { QuoteRefusal, QuoteSummary } from "@/lib/api/schema-types";
import { canPlaceOrders } from "@/lib/auth/permissions";
import { EMPTY_VALUES, bodyKey, type NewOrderValues } from "@/lib/new-order/form";
import { useCustomerProducts } from "@/lib/new-order/queries";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import { CustomerSection } from "./customer-section";
import { DeliverySection } from "./delivery-section";
import { LeaveDialog } from "./leave-dialog";
import { ModelCard } from "./model-field";
import { OrderTicket } from "./order-ticket";
import { Panel } from "./panel";
import { ProductSection } from "./product-section";
import { TicketDock } from "./ticket-dock";
import { useCheckout } from "./use-checkout";
import { useLeaveGuard } from "./use-leave-guard";
import { useMainShortcut } from "./use-main-shortcut";
import { useModel } from "./use-model";
import { usePlace, type PlaceFailure } from "./use-place";
import { usePrice, useQuoteBody } from "./use-price";

/** The wide layout: the ticket beside the work, as on the order page's `xl:` columns. */
const WIDE = "(min-width: 1280px)";

/** `/orders/new`: staff place an order for a customer, in panels on the left and the order on the right. */
export function NewOrderPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!canPlaceOrders(me)) notFound();
  return <NewOrder />;
}

function NewOrder() {
  const form = useForm<NewOrderValues>({ defaultValues: EMPTY_VALUES });
  const customerId = useWatch({ control: form.control, name: "customerId" });
  const productId = useWatch({ control: form.control, name: "productId" });
  const declaredUnit = useWatch({ control: form.control, name: "declaredUnit" });
  // The model lives here so the price can wait for it: `model.readyVersionId` is what to quote.
  // It uploads again for another customer or unit, so that version is never the last customer's.
  const model = useModel({ customerId, declaredUnit });
  // A price shows only while the body it was asked for is the one on screen.
  const body = useQuoteBody(form.control, model.readyVersionId);
  const price = usePrice(body);
  const guard = useLeaveGuard(form.formState.isDirty);
  const placing = usePlace({
    form,
    price,
    quoteKey: body === null ? null : bodyKey(body),
    // `placed=1` asks the order page to say it was just placed.
    onPlaced: (orderId) => guard.leaveNow(`/orders/${orderId}?placed=1`),
  });
  // The same cached list `useQuoteBody` reads, so the picked product is the one being priced.
  const products = useCustomerProducts(customerId || null);
  const product = products.data?.find((candidate) => candidate.id === productId);
  // The total, the address and its methods, and the one next action, worked out once for the page.
  const checkout = useCheckout({
    form,
    price,
    placing,
    model: { held: model.held !== null, ready: model.readyVersionId !== undefined, failed: model.failed },
    product,
  });
  useMainShortcut(checkout.main);

  const wide = useMediaQuery(WIDE);
  const [details, setDetails] = useState(false);
  // How the sheet last opened: from See details, or by itself for a message. Closing puts focus back on
  // See details, or on the main button, since the message that had focus is gone with the sheet.
  const [openedBy, setOpenedBy] = useState<"details" | "message">("details");
  const dockMain = useRef<HTMLButtonElement>(null);
  const dockDetails = useRef<HTMLButtonElement>(null);
  // The sheet is a narrow-only thing: widening closes it, so it doesn't come back on narrowing again.
  if (wide && details) setDetails(false);

  // The dock is fixed over the bottom of the page, and its height changes with a reason or an error, so
  // the page is padded by its measured height: the last panel is never hidden behind it.
  const [dockHeight, setDockHeight] = useState(0);
  const measureDock = useCallback((node: HTMLElement | null) => {
    if (node === null) return;
    setDockHeight(node.getBoundingClientRect().height);
    const observer = new ResizeObserver(() => setDockHeight(node.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Below 1280px the ticket is a sheet: refusals, a price changed at placing or a failed Place open it,
  // so the message is in view and can take focus. Each one opens it once, the same answer showing again
  // (a field changed, then changed back) doesn't. Set while rendering, so the sheet opens in the same
  // commit as the message, with no effect in between.
  const changedQuote = price.shown?.changed ? price.shown.quote : null;
  const [opened, setOpened] = useState<{ refusals: readonly QuoteRefusal[] | null; changed: QuoteSummary | null; failure: PlaceFailure | null }>({
    refusals: null,
    changed: null,
    failure: null,
  });
  const newRefusals = price.refusals.length > 0 && price.refusals !== opened.refusals;
  const newChange = changedQuote !== null && changedQuote !== opened.changed;
  const newFailure = placing.failure !== null && placing.failure !== opened.failure;
  if (!wide && (newRefusals || newChange || newFailure)) {
    setOpened({
      refusals: newRefusals ? price.refusals : opened.refusals,
      changed: newChange ? changedQuote : opened.changed,
      failure: newFailure ? placing.failure : opened.failure,
    });
    setOpenedBy("message");
    setDetails(true);
  }

  return (
    <FormProvider {...form}>
      <div className="flex w-full flex-col gap-3.5">
        <header className="flex flex-col gap-3 pt-1">
          {/* A same-site link: the leave guard asks first when something is entered. */}
          <Link href="/orders" className="inline-flex min-h-11 items-center gap-1 self-start font-medium text-ink-2 hover:text-ink md:min-h-0">
            <ChevronLeft aria-hidden className="size-4" />
            {COPY.back}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-title font-semibold">{COPY.title}</h1>
            <Button type="button" variant="outline" className="ml-auto min-h-11 rounded-full" onClick={() => guard.requestLeave("/orders")}>
              {COPY.cancel}
            </Button>
          </div>
        </header>

        <div
          className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_340px]"
          style={wide ? undefined : { paddingBottom: `calc(${dockHeight}px + 0.875rem)` }}
        >
          <div className="flex min-w-0 flex-col gap-3.5">
            {/* From Place until erp-api answers, nothing in the model, customer or product panels can be
                changed. The Delivery panel locks its own fields. The ticket's main button stays outside
                every fieldset, so it keeps focus while placing. */}
            <fieldset disabled={placing.pending} className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
              <ModelCard model={model} product={product} reasons={price.fieldRefusals.get("model")} />
              <Panel>
                {/* Customer and product side by side from `sm:`, the product's other fields under both. The
                    customer stays the grid's first child, so it keeps its state as the product comes and goes. */}
                <div className={cn("grid items-start gap-3.5", customerId !== "" && "sm:grid-cols-[1.4fr_1fr]")}>
                  {/* Another customer's prices are their own: the last one's price, shown or stale, goes. */}
                  <CustomerSection onCustomerChange={() => price.clear()} />
                  {customerId !== "" && <ProductSection refusals={price.fieldRefusals} />}
                </div>
              </Panel>
            </fieldset>
            {/* Open from the moment a customer is picked; a price coming or going never closes it. */}
            {customerId !== "" && <DeliverySection checkout={checkout} placing={placing} />}
          </div>

          {/* One ticket in the DOM at a time: beside the work when wide, a bar and a sheet below that. */}
          {wide && (
            <aside aria-label={COPY.ticket.label} className="sticky top-4 flex min-w-0 flex-col gap-4 rounded-[20px] bg-card px-4 py-5 sm:px-5">
              <p aria-hidden className="text-caption font-semibold tracking-wide text-ink-2 uppercase">
                {COPY.ticket.label}
              </p>
              <OrderTicket checkout={checkout} price={price} placing={placing} model={model} />
            </aside>
          )}
        </div>
      </div>
      {!wide && (
        <>
          <TicketDock
            ref={measureDock}
            mainRef={dockMain}
            detailsRef={dockDetails}
            checkout={checkout}
            price={price}
            onDetails={() => {
              setOpenedBy("details");
              setDetails(true);
            }}
          />
          <Sheet open={details} onOpenChange={setDetails}>
            {/* `data-ticket` tells the ⌘Enter shortcut this dialog is the ticket, not one that blocks it. */}
            <SheetContent
              side="bottom"
              data-ticket=""
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                // The sheet has no trigger, and what had focus inside it is gone: Radix would drop focus on the body.
                event.preventDefault();
                const target = openedBy === "details" ? dockDetails.current : dockMain.current;
                (target ?? dockDetails.current)?.focus();
              }}
              className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-[20px] px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5"
            >
              <SheetTitle className="pb-4 text-caption font-semibold tracking-wide text-ink-2 uppercase">{COPY.ticket.label}</SheetTitle>
              <OrderTicket checkout={checkout} price={price} placing={placing} model={model} />
            </SheetContent>
          </Sheet>
        </>
      )}
      <LeaveDialog {...guard.dialog} />
    </FormProvider>
  );
}
