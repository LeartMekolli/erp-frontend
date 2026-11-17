"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { canPlaceOrders } from "@/lib/auth/permissions";
import { EMPTY_VALUES, bodyKey, type NewOrderValues } from "@/lib/new-order/form";
import { useUpload } from "@/lib/upload/use-upload";

import { COPY } from "./copy";
import { CustomerSection } from "./customer-section";
import { DeliverySection } from "./delivery-section";
import { LeaveDialog } from "./leave-dialog";
import { readyVersionId } from "./model-field";
import { PriceSection } from "./price-section";
import { ProductSection } from "./product-section";
import { Section } from "./section";
import { useLeaveGuard } from "./use-leave-guard";
import { usePlace } from "./use-place";
import { usePrice, useQuoteBody } from "./use-price";

/** `/orders/new`: staff place an order for a customer, in four sections that open one after another. */
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
  // The model's upload lives here so the price can wait for it: `readyVersionId(upload)` is what to quote.
  // The product section resets it when the product changes and when it closes; another customer resets
  // it here too, since the model is the last customer's file even if the section stayed open.
  const upload = useUpload({ area: "staff", kind: "design", customerId: customerId || undefined, declaredUnit });
  const resetUpload = useRef(upload.reset);
  useEffect(() => {
    resetUpload.current = upload.reset;
  });
  useEffect(() => {
    resetUpload.current();
  }, [customerId]);
  // A price shows only while the body it was asked for is the one on screen.
  const body = useQuoteBody(form.control, readyVersionId(upload));
  const price = usePrice(body);
  const guard = useLeaveGuard(form.formState.isDirty);
  const placing = usePlace({
    form,
    price,
    quoteKey: body === null ? null : bodyKey(body),
    onPlaced: (orderId) => guard.leaveNow(`/orders/${orderId}`),
  });

  return (
    <FormProvider {...form}>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <div className="flex items-center gap-3 pt-1">
          <h1 className="text-title font-semibold">{COPY.title}</h1>
          <Button type="button" variant="outline" className="ml-auto min-h-11 rounded-full" onClick={() => guard.requestLeave("/orders")}>
            {COPY.cancel}
          </Button>
        </div>

        {/* From Place until erp-api answers, nothing in sections 1 to 3 can be changed. Section 4 locks its
            own fields, since its Place button must keep focus. */}
        <fieldset disabled={placing.pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <Section number={1} title={COPY.sections.customer} open>
            <CustomerSection />
          </Section>
          <Section number={2} title={COPY.sections.product} open={customerId !== ""} closedHint={COPY.closed.product}>
            <ProductSection refusals={price.fieldRefusals} upload={upload} />
          </Section>
          {/* Opens with the product while staff still fill it in, so focus stays in the product section. */}
          <Section
            number={3}
            title={COPY.sections.price}
            open={customerId !== "" && productId !== ""}
            closedHint={COPY.closed.price}
            focusOnOpen={false}
          >
            <PriceSection price={price} />
          </Section>
        </fieldset>
        {/* Opens when a price arrives, and stays open with a refusal at Place that cleared the price.
            Focus stays on Get price, so staff read the new price before moving on to delivery. */}
        <Section
          number={4}
          title={COPY.sections.delivery}
          open={price.shown !== null || placing.failure !== null}
          closedHint={COPY.closed.delivery}
          focusOnOpen={false}
        >
          <DeliverySection price={price} placing={placing} />
        </Section>
      </div>
      <LeaveDialog {...guard.dialog} />
    </FormProvider>
  );
}
