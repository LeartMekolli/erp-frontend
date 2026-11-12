"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { applyFieldErrors, isApiProblem, problemFrom } from "@/lib/api/problem";
import type { Order, ShipBody } from "@/lib/api/schema-types";
import { invalidateOrders } from "@/lib/orders/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { OfflineError } from "@/lib/session/client-session";

import { ShipChoice } from "./ship-choice";

// erp-api's rules (`orders.service.ts:199-203`); both optional.
const schema = z.object({
  courier: z.string().trim().max(100, "Use at most 100 characters."),
  tracking: z.string().trim().max(200, "Use at most 200 characters."),
});
type Values = z.infer<typeof schema>;

const FIELDS = ["courier", "tracking"] as const;

type Choice = "tracking" | "label";

/** What went wrong, and the way on it offers. */
interface Failure {
  message: string;
  offer: "tracking" | "retry" | null;
}

/**
 * Ships one ready order (`POST /orders/{id}/ship`, spec §6.2): with a courier
 * and tracking number typed in, or with a label bought from the workspace's
 * courier service. After tracking it closes and hands back what to announce;
 * after a label it stays open to offer the label for printing.
 */
export function ShipDialog({
  order,
  open,
  onOpenChange,
  onShipped,
}: {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShipped: (message: string) => void;
}) {
  return (
    <Dialog open={open && order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-5 p-5 sm:max-w-md">
        {order && (
          <ShipForm
            key={order.id}
            order={order}
            onClose={() => onOpenChange(false)}
            onShipped={(message) => {
              onOpenChange(false);
              onShipped(message);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShipForm({ order, onClose, onShipped }: { order: Order; onClose: () => void; onShipped: (message: string) => void }) {
  const client = useQueryClient();
  const [choice, setChoice] = useState<Choice>("tracking");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  // The body last sent, so "Try again" sends the same input and so the same key.
  const lastBody = useRef<ShipBody | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { courier: "", tracking: "" } });

  const ship = useApiMutation<ShipBody, Order>(async (body, key) => {
    const { data, error, response } = await api.POST("/orders/{id}/ship", {
      params: { path: { id: order.id }, header: idempotencyHeader(key) },
      body,
    });
    if (!data) throw problemFrom(error, response);
    return data;
  });

  const send = async (body: ShipBody) => {
    lastBody.current = body;
    setFailure(null);
    let shipped: Order;
    try {
      shipped = await ship.mutateAsync(body);
    } catch (error) {
      setFailure(failureFrom(error, body));
      // A 409 means the order moved on, or has no way to buy a label: show it as it is now.
      if (isApiProblem(error) && error.status === 409) void invalidateOrders(client);
      return;
    }
    void invalidateOrders(client);
    const url = shipped.shipping.label?.url ?? null;
    if (body.label && url) setLabelUrl(url);
    else onShipped(`#${order.number} shipped.`);
  };

  const failureFrom = (error: unknown, body: ShipBody): Failure => {
    if (error instanceof OfflineError) return { message: noAnswer(), offer: null };
    if (!isApiProblem(error)) return { message: UNKNOWN, offer: null };
    if (error.status === 503) return { message: error.detail || UNKNOWN, offer: "retry" };
    if (body.label && (error.status === 409 || error.status === 400))
      // The dialog has no fields for a label's parcel, carrier or service, so tracking is the way on.
      return { message: error.detail || UNKNOWN, offer: "tracking" };
    if (error.status === 400) return { message: applyFieldErrors(error, setError, FIELDS) ?? "", offer: null };
    return { message: error.detail || UNKNOWN, offer: null };
  };

  const onSubmit = (values: Values) => {
    if (choice === "label") return send({ label: {} });
    const courier = values.courier.trim();
    const tracking = values.tracking.trim();
    // Only what was filled in: erp-api refuses empty text.
    return send({ ...(courier && { courier }), ...(tracking && { tracking }) });
  };

  if (labelUrl) {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-base font-semibold">{`Ship #${order.number}`}</DialogTitle>
          <DialogDescription asChild>
            <p role="status" className="text-sm text-ink">{`#${order.number} shipped.`}</p>
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button asChild>
            <a href={labelUrl} target="_blank" rel="noopener noreferrer">
              Print label
              <ExternalLink aria-hidden />
            </a>
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </>
    );
  }

  const busy = ship.isPending;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-base font-semibold">{`Ship #${order.number}`}</DialogTitle>
        <DialogDescription className="text-sm text-ink-2">{order.customer.name}</DialogDescription>
      </div>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
        {failure && failure.message && (
          <div className="flex flex-col gap-2">
            <FormMessage tone="error">{failure.message}</FormMessage>
            {failure.offer === "tracking" && (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => {
                  setChoice("tracking");
                  setFailure(null);
                }}
              >
                Enter tracking instead
              </Button>
            )}
            {failure.offer === "retry" && (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={busy}
                onClick={() => lastBody.current && void send(lastBody.current)}
              >
                Try again
              </Button>
            )}
          </div>
        )}
        <fieldset disabled={busy} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">How to ship</legend>
            <div className="grid grid-cols-2 gap-2">
              <ShipChoice name="ship-choice" value="tracking" label="Enter tracking" choice={choice} onChoose={setChoice} />
              <ShipChoice name="ship-choice" value="label" label="Buy a label" choice={choice} onChoose={setChoice} />
            </div>
          </fieldset>
          {choice === "tracking" ? (
            <>
              <Field id="ship-courier" label="Courier" error={errors.courier?.message}>
                {(props) => <Input {...props} {...register("courier")} autoComplete="off" maxLength={100} />}
              </Field>
              <Field id="ship-tracking" label="Tracking number" error={errors.tracking?.message}>
                {(props) => <Input {...props} {...register("tracking")} autoComplete="off" maxLength={200} />}
              </Field>
            </>
          ) : (
            <p className="text-sm text-ink">
              {`The label uses this order's shipping method (${order.shipping.method.name}). Buying it takes a few seconds.`}
            </p>
          )}
          <p className="text-caption text-ink-2">The customer gets an email with the tracking number.</p>
          <Button type="submit" className="mt-1">
            {busy ? (ship.variables?.label ? "Buying the label…" : "Shipping…") : "Ship order"}
          </Button>
        </fieldset>
      </form>
    </>
  );
}
