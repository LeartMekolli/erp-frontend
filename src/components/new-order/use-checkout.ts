"use client";

import { useWatch, type Path, type UseFormReturn } from "react-hook-form";

import type { Address, CatalogProduct, ShippingRate } from "@/lib/api/schema-types";
import { addMoney, formatMoney } from "@/lib/format/money";
import {
  ADDRESS_FIELDS,
  EMPTY_ADDRESS,
  orderAddress,
  placeBody,
  priceBlocker,
  type AddressField,
  type NewOrderValues,
} from "@/lib/new-order/form";
import { useCustomerAddresses, useShippingRates } from "@/lib/new-order/queries";
import { useOnline } from "@/lib/query/use-online";
import { useDebouncedValue } from "@/lib/use-debounced-value";

import { COPY } from "./copy";
import type { Placing } from "./use-place";
import type { Price } from "./use-price";

/** How long a typed address stands still before its shipping methods are asked for. */
const RATES_DELAY_MS = 400;

const addressPath = (field: AddressField) => `address.${field}` as const;

/** The one thing to press next: get a price, get a new one after a change, or place the order. */
export interface MainAction {
  kind: "get-price" | "get-new-price" | "place";
  label: string;
  /** Pressing does nothing; shown as `aria-disabled`, so focus stays on the button. */
  off: boolean;
  /** Why it is off, the first that applies, or null when there is nothing to say. */
  reason: string | null;
  run(): void;
}

export interface Checkout {
  /** The customer's saved addresses. */
  addresses: ReturnType<typeof useCustomerAddresses>;
  /** The address typed for this order, or null for the saved one. With none saved, an empty form. */
  draft: Address | null;
  /** Puts `next` on the form (null is the saved address), clearing the errors of the fields it changes. */
  setAddress(next: Address | null): void;
  /** A typed address that hasn't stood still long enough to ask for its shipping methods. */
  waiting: boolean;
  /** The shipping methods query for the address on screen. */
  rates: ReturnType<typeof useShippingRates>;
  /** Whether shipping methods are asked for this address: the saved one, or a complete typed one that stood still. */
  ratesFor: boolean;
  /** The methods for this address only; undefined while there are none for it. */
  rateList: ShippingRate[] | undefined;
  /** The picked method, while it is listed and can be used. */
  rate: ShippingRate | undefined;
  /** The shown price, with the picked method's shipping once there is one. */
  total: { label: string; amount: string } | null;
  main: MainAction;
}

/**
 * The order's checkout, worked out once for the page: the address and its shipping methods, the total,
 * and the one action to press next with the reason it is off. Called once by the page, which hands it
 * to the delivery section and the ticket.
 */
export function useCheckout({
  form,
  price,
  placing,
  model,
  product,
}: {
  form: Pick<UseFormReturn<NewOrderValues>, "control" | "setValue" | "clearErrors">;
  price: Price;
  placing: Placing;
  /** `held`: a file is chosen; `ready`: it is measured for the current customer. */
  model: { held: boolean; ready: boolean; failed?: boolean };
  /** The picked product, once the customer's products have loaded. */
  product: CatalogProduct | undefined;
}): Checkout {
  const { control, setValue, clearErrors } = form;
  const [customerId, productId, size, address, shippingMethod, note] = useWatch({
    control,
    name: ["customerId", "productId", "size", "address", "shippingMethod", "note"],
  });
  const online = useOnline();

  const addresses = useCustomerAddresses(customerId || null);
  const saved = addresses.data?.shipping_address ?? null;
  // `address` null is the saved one; with none saved, an empty form stands in for it.
  const draft = address ?? (addresses.data && saved === null ? EMPTY_ADDRESS : null);
  const typed = draft === null ? null : orderAddress(draft);
  // A typed address is asked about once it stops changing, not on every keystroke. Compared by content,
  // since `typed` is a new object each render. The saved address is erp-api's own and isn't delayed.
  const typedKey = typed === null ? null : JSON.stringify(typed);
  const settledKey = useDebouncedValue(typedKey, RATES_DELAY_MS);
  const waiting = draft !== null && typedKey !== null && settledKey !== typedKey;
  // While the typed address and its settled one differ, no rates apply: not the last address's, and not Place.
  const ratesFor = draft === null ? saved !== null : typedKey !== null && !waiting;
  const rates = useShippingRates(customerId || null, typed, ratesFor);
  // A disabled query can still hold another address's rates under the same key: only these count.
  const rateList = ratesFor ? rates.data : undefined;

  const quote = price.shown?.quote ?? null;
  const rate = rateList?.find((candidate) => candidate.key === shippingMethod && candidate.available && candidate.price !== null);
  const shipping = rate?.price ?? null;
  let total: Checkout["total"] = null;
  if (quote !== null) {
    total =
      shipping === null
        ? { label: COPY.ticket.beforeShipping, amount: formatMoney(quote.total, quote.currency) }
        : { label: COPY.delivery.total, amount: formatMoney(addMoney(quote.total, shipping), quote.currency) };
  }

  function setAddress(next: Address | null) {
    const before = draft;
    setValue("address", next, { shouldDirty: true });
    for (const field of ADDRESS_FIELDS) {
      if (next === null || before === null || next[field] !== before[field]) clearErrors(addressPath(field));
    }
  }

  let main: MainAction;
  if (quote !== null) {
    const body = rate ? placeBody({ customerId, address: draft, shippingMethod, note }, quote.id) : null;
    const off = body === null || placing.pending || !online;
    // One reason Place is off, in the order staff would fix them. Nothing is said while something is
    // still loading (the delivery section says so itself), while placing, or when a load failure or an
    // empty list already explains it. Offline wins over all.
    const addressKnown = addresses.data !== undefined;
    const addressComplete = draft === null ? saved !== null : typed !== null;
    const methodsListed = ratesFor && !waiting && rateList !== undefined && rateList.length > 0;
    let reason: string | null = null;
    if (!online) reason = COPY.delivery.offline;
    else if (!placing.pending && addressKnown) {
      if (!addressComplete) reason = COPY.delivery.fillAddress;
      else if (methodsListed && !rate) reason = COPY.delivery.pickMethod;
    }
    main = {
      kind: "place",
      label: placing.pending ? COPY.delivery.placing : COPY.delivery.place,
      off,
      reason,
      run() {
        if (body === null || off) return;
        // erp-api's errors on the address belong on the form only while it is shown.
        const fields: Path<NewOrderValues>[] = ["shippingMethod", "note", ...(draft === null ? [] : ADDRESS_FIELDS.map(addressPath))];
        placing.place(body, fields);
      },
    };
  } else {
    const stale = price.stale !== null;
    const blocker = priceBlocker({ customerId, productId, size }, product, model);
    const off = !online || blocker !== null || !price.ready || price.pending;
    // Offline wins; then the first thing staff must fill in. A form that is filled in but can't be
    // priced yet (a speed still loading, a bad quantity) says nothing here: its own field does.
    const reason = !online ? COPY.price.offline : blocker === null ? null : COPY.ticket.blocked[blocker];
    main = {
      kind: stale ? "get-new-price" : "get-price",
      label: price.pending ? COPY.price.getting : stale ? COPY.ticket.getNewPrice : COPY.price.get,
      off,
      reason,
      run() {
        if (!off) price.getPrice();
      },
    };
  }

  return { addresses, draft, setAddress, waiting, rates, ratesFor, rateList, rate, total, main };
}
