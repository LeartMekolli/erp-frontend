"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { notFound } from "next/navigation";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { canPlaceOrders } from "@/lib/auth/permissions";
import { EMPTY_VALUES, newOrderSchema, type NewOrderValues } from "@/lib/new-order/form";

import { COPY } from "./copy";
import { LeaveDialog } from "./leave-dialog";
import { Section } from "./section";
import { useLeaveGuard } from "./use-leave-guard";

/** `/orders/new`: staff place an order for a customer, in four sections that open one after another. */
export function NewOrderPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!canPlaceOrders(me)) notFound();
  return <NewOrder />;
}

function NewOrder() {
  const form = useForm<NewOrderValues>({ resolver: zodResolver(newOrderSchema), defaultValues: EMPTY_VALUES });
  const customerId = useWatch({ control: form.control, name: "customerId" });
  const guard = useLeaveGuard(form.formState.isDirty);

  return (
    <FormProvider {...form}>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <div className="flex items-center gap-3 pt-1">
          <h1 className="text-title font-semibold">{COPY.title}</h1>
          <Button type="button" variant="outline" className="ml-auto min-h-11 rounded-full" onClick={() => guard.requestLeave("/orders")}>
            {COPY.cancel}
          </Button>
        </div>

        <Section number={1} title={COPY.sections.customer} open />
        <Section number={2} title={COPY.sections.product} open={customerId !== ""} closedHint={COPY.closed.product} />
        {/* Tasks 9 and 10 open these two, once there is a product and a price. */}
        <Section number={3} title={COPY.sections.price} open={false} closedHint={COPY.closed.price} />
        <Section number={4} title={COPY.sections.delivery} open={false} closedHint={COPY.closed.delivery} />
      </div>
      <LeaveDialog {...guard.dialog} />
    </FormProvider>
  );
}
