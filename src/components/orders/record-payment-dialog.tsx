"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { idempotent } from "@/lib/api/idempotency";
import { applyFieldErrors, isApiProblem, problemFrom } from "@/lib/api/problem";
import type { Order, PaidByHandBody } from "@/lib/api/schema-types";
import { workspaceToday } from "@/lib/orders/labels";
import { invalidateOrders } from "@/lib/orders/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { OfflineError } from "@/lib/session/client-session";

// erp-api's rules (`payment-response.ts:76-79`).
const schemaFor = (today: string) =>
  z.object({
    reference: z.string().trim().min(1, "Enter a reference.").max(200, "Use at most 200 characters."),
    received_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the day it arrived.")
      .refine((day) => day <= today, "Pick today or an earlier day."),
  });
type Values = z.infer<ReturnType<typeof schemaFor>>;

const FIELDS = ["reference", "received_on"] as const;

/**
 * Records a payment made outside the payment provider, such as a bank
 * transfer (`POST /orders/{id}/paid-by-hand`). On success it closes and hands
 * back what to announce; the list, counts and tiles refetch.
 */
export function RecordPaymentDialog({
  order,
  open,
  onOpenChange,
  onRecorded,
}: {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (message: string) => void;
}) {
  return (
    <Dialog open={open && order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-5 p-5 sm:max-w-md">
        {order && (
          <PaymentForm
            key={order.id}
            order={order}
            onDone={(message) => {
              onOpenChange(false);
              onRecorded(message);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ order, onDone }: { order: Order; onDone: (message: string) => void }) {
  const { data: me } = useMe();
  const client = useQueryClient();
  const today = workspaceToday(me?.workspace.timezone ?? "UTC");
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schemaFor(today)), defaultValues: { reference: "", received_on: today } });

  const record = useApiMutation<PaidByHandBody, Order>(async (body, key) => {
    const { data, error, response } = await api.POST("/orders/{id}/paid-by-hand", {
      params: { path: { id: order.id } },
      body,
      ...idempotent(key),
    });
    if (!data) throw problemFrom(error, response);
    return data;
  });

  const onSubmit = async (values: Values) => {
    setMessage(null);
    try {
      await record.mutateAsync({ reference: values.reference.trim(), received_on: values.received_on });
    } catch (error) {
      if (error instanceof OfflineError) setMessage(noAnswer());
      else if (isApiProblem(error) && error.status === 400) setMessage(applyFieldErrors(error, setError, FIELDS));
      else {
        setMessage((isApiProblem(error) && error.detail) || UNKNOWN);
        // A 409 means the order moved on: show it as it is now.
        if (isApiProblem(error) && error.status === 409) void invalidateOrders(client);
      }
      return;
    }
    void invalidateOrders(client);
    onDone(`Payment recorded for #${order.number}.`);
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-base font-semibold">{`Record a payment for #${order.number}`}</DialogTitle>
        <DialogDescription className="text-sm text-ink-2">
          {`For a payment made outside the payment provider, such as a bank transfer. ${order.customer.name}.`}
        </DialogDescription>
      </div>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
        {message && <FormMessage tone="error">{message}</FormMessage>}
        <fieldset disabled={record.isPending} className="flex flex-col gap-4">
          <Field id="payment-reference" label="Reference" hint="Such as the bank transfer reference" error={errors.reference?.message}>
            {(props) => <Input {...props} {...register("reference")} autoComplete="off" maxLength={200} />}
          </Field>
          <Field id="payment-received-on" label="Received on" error={errors.received_on?.message}>
            {(props) => <Input {...props} {...register("received_on")} type="date" max={today} />}
          </Field>
          <Button type="submit" className="mt-1">
            {record.isPending ? "Recording…" : "Record payment"}
          </Button>
        </fieldset>
      </form>
    </>
  );
}
