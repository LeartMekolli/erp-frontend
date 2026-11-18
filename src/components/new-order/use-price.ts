"use client";

import { useState } from "react";
import { useWatch, type Control } from "react-hook-form";

import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { isApiProblem } from "@/lib/api/problem";
import type { QuoteBody, QuoteRefusal, QuoteSummary } from "@/lib/api/schema-types";
import { bodyKey, quoteBody, refusalField, type NewOrderValues } from "@/lib/new-order/form";
import { useGetQuote } from "@/lib/new-order/mutations";
import { useCustomerProducts, useDeliverySpeeds } from "@/lib/new-order/queries";

import type { RefusedField, Refusals } from "./product-section";

/**
 * What the form asks erp-api to price right now, or null while it can't be priced: no product yet,
 * the customer's products or delivery speeds still loading (so a speed picked for another customer is
 * never sent), a speed the customer's plan doesn't offer, or what `quoteBody` turns away.
 */
export function useQuoteBody(control: Control<NewOrderValues>, versionId: string | undefined): QuoteBody | null {
  const [customerId, productId, options, size, quantity, speed] = useWatch({
    control,
    name: ["customerId", "productId", "options", "size", "quantity", "speed"],
  });
  const products = useCustomerProducts(customerId || null);
  const speeds = useDeliverySpeeds(customerId || null);

  const product = products.data?.find((candidate) => candidate.id === productId);
  if (!product || !speeds.data) return null;
  // The product section picks the plan's default speed once the speeds load; until then, nothing to price.
  const offered = speeds.data;
  const speedOffered = offered.length === 0 ? speed === "" : offered.some((choice) => choice.key === speed);
  if (!speedOffered) return null;
  return quoteBody({ customerId, options, size, quantity, speed }, product, versionId);
}

/** erp-api's reasons, each message under the field it belongs to; reasons with no field are left out. */
export function refusalsByField(reasons: readonly QuoteRefusal[]): Refusals {
  const byField = new Map<RefusedField, string[]>();
  for (const reason of reasons) {
    const field = refusalField(reason.code);
    if (field) byField.set(field, [...(byField.get(field) ?? []), reason.message]);
  }
  return byField;
}

/** Why a quote got no price: erp-api's own words (a 403 or 404 says why), or that no answer came. */
function failureMessage(error: unknown): string {
  if (isApiProblem(error)) return error.detail || error.errors?.map((field) => field.message).join(" ") || UNKNOWN;
  return noAnswer();
}

/** One answer from erp-api, kept with the key of the body it was asked for. */
type Answer =
  | { key: string; kind: "priced"; quote: QuoteSummary; changed: boolean }
  | { key: string; kind: "refused"; reasons: readonly QuoteRefusal[] };

const NO_REASONS: readonly QuoteRefusal[] = [];

/**
 * The price of the form's current body. Each answer (a price, refusals or a failure) is stored with the
 * `bodyKey` it was asked for and shown only while that is still the current body's key, so any change
 * on screen (an option, size, quantity, speed, model or customer) hides it with no extra wiring, and
 * nothing outlives the configuration it was about.
 */
export function usePrice(body: QuoteBody | null) {
  const quote = useGetQuote();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  // The last price erp-api gave, whatever came after it, so a change can say "Get new price".
  const [lastPriced, setLastPriced] = useState<{ key: string; quote: QuoteSummary } | null>(null);

  const key = body === null ? null : bodyKey(body);
  const current = key !== null && answer?.key === key ? answer : null;
  const refusals = current?.kind === "refused" ? current.reasons : NO_REASONS;
  const fieldRefusals = refusalsByField(refusals);

  async function ask(asked: QuoteBody) {
    const askedKey = bodyKey(asked);
    setFailure(null);
    try {
      const result = await quote.mutateAsync(asked);
      if (result.accepted) {
        setAnswer({ key: askedKey, kind: "priced", quote: result.quote, changed: false });
        setLastPriced({ key: askedKey, quote: result.quote });
      } else {
        setAnswer({ key: askedKey, kind: "refused", reasons: result.reasons });
      }
    } catch (error) {
      // Nothing entered is touched: staff press Get price again, and the same body reuses its key.
      setFailure({ key: askedKey, message: failureMessage(error) });
    }
  }

  return {
    /** Whether there is a body to price. */
    ready: body !== null,
    shown: current?.kind === "priced" ? { quote: current.quote, changed: current.changed } : null,
    /** The last price given for another body than the current one (or for none): the form changed since. */
    stale: lastPriced !== null && lastPriced.key !== key ? lastPriced.quote : null,
    refusals,
    /** The refusals' messages under the field each belongs to, for the product section. */
    fieldRefusals,
    refusedFields: new Set<RefusedField>(fieldRefusals.keys()),
    /** Asks erp-api for a fresh quote of the current body; does nothing without one or while asking. */
    getPrice(): void {
      if (body !== null && !quote.isPending) void ask(body);
    },
    /**
     * Stores a quote erp-api priced again at placing (`price_changed`) as the price of the body this
     * render had, not the one on screen when it's called: call it on the `usePrice` result of the render
     * that placed, so it lands under the placed body and stays hidden if the form changed meanwhile.
     */
    adopt(changed: QuoteSummary): void {
      if (key === null) return;
      setFailure(null);
      setAnswer({ key, kind: "priced", quote: changed, changed: true });
      setLastPriced({ key, quote: changed });
    },
    /** Like `adopt`, for why that body can't be priced now (`price_changed` with no quote). */
    adoptRefusals(reasons: QuoteRefusal[]): void {
      if (key === null) return;
      setFailure(null);
      setAnswer({ key, kind: "refused", reasons });
    },
    /** Forgets every answer and the stale price, so staff get a fresh price. */
    clear(): void {
      setAnswer(null);
      setFailure(null);
      setLastPriced(null);
    },
    pending: quote.isPending,
    error: failure !== null && failure.key === key ? failure.message : null,
  };
}

export type Price = ReturnType<typeof usePrice>;
