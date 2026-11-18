"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { canPlaceOrders } from "@/lib/auth/permissions";
import { EMPTY_VALUES, bodyKey, type NewOrderValues } from "@/lib/new-order/form";
import { useCustomerProducts } from "@/lib/new-order/queries";

import { COPY } from "./copy";
import { CustomerSection } from "./customer-section";
import { DeliverySection } from "./delivery-section";
import { LeaveDialog } from "./leave-dialog";
import { ModelField, readyVersionId } from "./model-field";
import { Panel } from "./panel";
import { PriceSection } from "./price-section";
import { ProductSection } from "./product-section";
import { useCheckout } from "./use-checkout";
import { useLeaveGuard } from "./use-leave-guard";
import { useModel } from "./use-model";
import { usePlace } from "./use-place";
import { usePrice, useQuoteBody } from "./use-price";

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
  // The model lives here so the price can wait for it: `readyVersionId(model.upload)` is what to quote.
  // It uploads again for another customer or unit, so that version is never the last customer's.
  const model = useModel({ customerId, declaredUnit });
  // A price shows only while the body it was asked for is the one on screen.
  const body = useQuoteBody(form.control, readyVersionId(model.upload));
  const price = usePrice(body);
  const guard = useLeaveGuard(form.formState.isDirty);
  const placing = usePlace({
    form,
    price,
    quoteKey: body === null ? null : bodyKey(body),
    onPlaced: (orderId) => guard.leaveNow(`/orders/${orderId}`),
  });
  // The same cached list `useQuoteBody` reads, so the picked product is the one being priced.
  const products = useCustomerProducts(customerId || null);
  const product = products.data?.find((candidate) => candidate.id === productId);
  // The total, the address and its methods, and the one next action, worked out once for the page.
  const checkout = useCheckout({
    form,
    price,
    placing,
    model: { held: model.held !== null, ready: readyVersionId(model.upload) !== undefined },
    product,
  });

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

        <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-3.5">
            {/* From Place until erp-api answers, nothing in the model, customer or product panels can be
                changed. The Delivery panel locks its own fields, since its Place button must keep focus. */}
            <fieldset disabled={placing.pending} className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
              <Panel title={COPY.model.label}>
                {product?.kind === "custom" ? (
                  <ModelField model={model} reasons={price.fieldRefusals.get("model")} />
                ) : (
                  <p className="text-sm text-ink-2">{COPY.model.forCustom}</p>
                )}
              </Panel>
              <Panel>
                <CustomerSection />
                {customerId !== "" && <ProductSection refusals={price.fieldRefusals} />}
              </Panel>
            </fieldset>
            {customerId !== "" && (
              <Panel title={COPY.delivery.title}>
                <DeliverySection checkout={checkout} placing={placing} />
              </Panel>
            )}
          </div>

          {/* Task 5 replaces this with the order ticket; until then it holds the price section. */}
          <aside aria-label={COPY.ticket.label} className="min-w-0">
            <fieldset disabled={placing.pending} className="m-0 min-w-0 border-0 p-0">
              <Panel>
                <PriceSection price={price} />
              </Panel>
            </fieldset>
          </aside>
        </div>
      </div>
      <LeaveDialog {...guard.dialog} />
    </FormProvider>
  );
}
