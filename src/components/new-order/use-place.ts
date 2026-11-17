"use client";

import { useState } from "react";
import type { Path, UseFormReturn } from "react-hook-form";

import { noAnswer } from "@/components/auth/copy";
import { applyFieldErrors, isApiProblem } from "@/lib/api/problem";
import type { PlaceOrderBody } from "@/lib/api/schema-types";
import { placeRefusal, type NewOrderValues } from "@/lib/new-order/form";
import { usePlaceOrder } from "@/lib/new-order/mutations";

import { COPY } from "./copy";
import type { Price } from "./use-price";

/** Why the last Place didn't place, kept with the quote body and the quote it was for. */
export interface PlaceFailure {
  message: string;
  quoteKey: string | null;
  quoteId: string;
}

/** erp-api's field paths in the place body, as the form's field names. */
function formPath(path: string): string {
  return path === "shipping_method" ? "shippingMethod" : path;
}

/**
 * Placing the order, and what to show when it doesn't place. A failure shows only while the quote body
 * it was for is still on screen and no other quote has been shown since, so it can outlive the price it
 * cleared (a 409) but not a change of product, customer or price.
 */
export function usePlace({
  form,
  price,
  quoteKey,
  onPlaced,
}: {
  form: Pick<UseFormReturn<NewOrderValues>, "setError" | "clearErrors">;
  price: Price;
  /** `bodyKey` of the quote body on screen, or null when there is none. */
  quoteKey: string | null;
  onPlaced: (orderId: string) => void;
}) {
  const placeOrder = usePlaceOrder();
  const [failure, setFailure] = useState<PlaceFailure | null>(null);

  const shownId = price.shown?.quote.id ?? null;
  const visible = failure !== null && failure.quoteKey === quoteKey && (shownId === null || shownId === failure.quoteId) ? failure : null;

  async function send(body: PlaceOrderBody, fields: readonly Path<NewOrderValues>[]) {
    // The price of this render, the one whose quote is placed: what erp-api answers about the quote is
    // stored under this body, and stays hidden if staff changed the order meanwhile.
    const placed = price;
    const failed = (message: string) => setFailure({ message, quoteKey, quoteId: body.lines[0]?.quote_id ?? "" });
    setFailure(null);
    form.clearErrors();
    let orderId: string;
    try {
      orderId = (await placeOrder.mutateAsync(body)).id;
    } catch (error) {
      // No answer: everything stays, and Place again sends the same body with the same key.
      if (!isApiProblem(error)) return failed(noAnswer());
      const refusal = placeRefusal(error);
      if (refusal.kind === "price_changed") {
        // A new quote changes the body, so the next Place has a new key; the price section takes focus.
        if (refusal.line.quote) placed.adopt(refusal.line.quote);
        else placed.adoptRefusals(refusal.line.reasons);
        return;
      }
      if (error.status === 400) {
        const named = { ...error, errors: error.errors?.map((field) => ({ ...field, path: formPath(field.path) })) };
        return failed(applyFieldErrors(named, form.setError, fields) ?? error.detail ?? COPY.delivery.checkFields);
      }
      // A quote that can't be placed any more: staff get a fresh price before trying again. A request
      // still running under this key isn't a refusal, so its price stays.
      if (error.status === 409 && error.code !== "idempotency_in_progress") placed.clear();
      return failed(refusal.message);
    }
    onPlaced(orderId);
  }

  return {
    /** Places `body` once; `fields` are the form fields erp-api's field errors may land on. Does nothing while placing. */
    place(body: PlaceOrderBody, fields: readonly Path<NewOrderValues>[]): void {
      if (!placeOrder.isPending) void send(body, fields);
    },
    pending: placeOrder.isPending,
    /** A new object for each failure, so focus can move to its message each time. */
    failure: visible,
  };
}

export type Placing = ReturnType<typeof usePlace>;
