"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useFormContext, useFormState, useWatch, type Path } from "react-hook-form";

import { LoadFailure } from "@/components/data/load-failure";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Address, ShippingRate } from "@/lib/api/schema-types";
import { addMoney, formatMoney } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { ADDRESS_FIELDS, EMPTY_ADDRESS, MAX_NOTE, orderAddress, placeBody, type AddressField, type NewOrderValues } from "@/lib/new-order/form";
import { useCustomerAddresses, useShippingRates } from "@/lib/new-order/queries";
import { useOnline } from "@/lib/query/use-online";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

import { AddressForm } from "./address-form";
import { COPY } from "./copy";
import { FieldRow } from "./field-row";
import type { Placing } from "./use-place";
import type { Price } from "./use-price";

/** How long a typed address stands still before its shipping methods are asked for. */
const RATES_DELAY_MS = 400;

const addressPath = (field: AddressField) => `address.${field}` as const;

/** The saved address on one line: "Luna Jewels, 12 rue des Orfèvres, 69002 Lyon, FR". */
export function addressLine(address: Address): string {
  return [address.name, address.line1, address.line2, `${address.postal_code} ${address.city}`, address.region, address.country]
    .filter((part) => part !== undefined && part.trim() !== "")
    .join(", ");
}

/**
 * Section 4: where the order goes, how it ships, a note, the total before tax, and Place order. The
 * customer's saved address is used unless staff change it for this order; with none saved, the form is
 * open and must be filled in. Shipping is asked for once the address is the saved one or complete.
 */
export function DeliverySection({ price, placing }: { price: Price; placing: Placing }) {
  const { control, setValue, clearErrors } = useFormContext<NewOrderValues>();
  const [customerId, address, shippingMethod, note] = useWatch({ control, name: ["customerId", "address", "shippingMethod", "note"] });
  const { errors } = useFormState({ control });
  const format = useFormat();
  const online = useOnline();
  const reasonId = useId();
  const addressLabelId = useId();

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
  const total = quote && rate?.price ? formatMoney(addMoney(quote.total, rate.price), quote.currency) : null;
  const body = quote && rate ? placeBody({ customerId, address: draft, shippingMethod, note }, quote.id) : null;
  const blocked = body === null || placing.pending || !online;

  // One reason Place is off, in the order staff would fix them. Nothing is said while something is still
  // loading (the section says so itself), while placing, or when a load failure or an empty list already
  // explains it. Offline wins over all.
  const addressKnown = addresses.data !== undefined;
  const addressComplete = draft === null ? saved !== null : typed !== null;
  const methodsListed = ratesFor && !waiting && rateList !== undefined && rateList.length > 0;
  let reason: string | null = null;
  if (!online) reason = COPY.delivery.offline;
  else if (!placing.pending && addressKnown) {
    if (!addressComplete) reason = COPY.delivery.fillAddress;
    else if (methodsListed && !rate) reason = COPY.delivery.pickMethod;
  }

  // Focus follows Change and Use the saved address to what replaced the button pressed.
  const formBox = useRef<HTMLDivElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<"form" | "change" | null>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    if (target === "form") formBox.current?.querySelector("input")?.focus();
    else changeButton.current?.focus();
  });

  // Each refusal at Place that isn't about the price moves focus to its message.
  const failureBox = useRef<HTMLDivElement>(null);
  const { failure } = placing;
  useEffect(() => {
    if (failure) failureBox.current?.focus();
  }, [failure]);

  function setAddress(next: Address | null) {
    const before = draft;
    setValue("address", next, { shouldDirty: true });
    for (const field of ADDRESS_FIELDS) {
      if (next === null || before === null || next[field] !== before[field]) clearErrors(addressPath(field));
    }
  }

  function place() {
    if (body === null || blocked) return;
    // erp-api's errors on the address belong on the form only while it is shown.
    const fields: Path<NewOrderValues>[] = ["shippingMethod", "note", ...(draft === null ? [] : ADDRESS_FIELDS.map(addressPath))];
    placing.place(body, fields);
  }

  const addressErrors = errors.address as Partial<Record<AddressField, { message?: string }>> | undefined;
  const typedErrors: Partial<Record<AddressField, string>> = {};
  for (const field of ADDRESS_FIELDS) {
    const message = addressErrors?.[field]?.message;
    if (message) typedErrors[field] = message;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Locked while placing. The Place button sits outside it: a disabled button would drop focus. */}
      <fieldset disabled={placing.pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <Row label={COPY.delivery.address} labelId={addressLabelId}>
          <div role="group" aria-labelledby={addressLabelId} className="flex min-w-0 flex-col gap-3">
            {addresses.isPending && <p className="text-sm text-ink-2">{COPY.delivery.addressLoading}</p>}
            {addresses.isError && (
              <LoadFailure error={addresses.error} fallback={COPY.delivery.addressFailed} onRetry={() => void addresses.refetch()} />
            )}
            {draft === null && saved && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="min-w-0 text-sm break-words text-ink">
                  {addressLine(saved)} <span className="text-ink-2">{COPY.delivery.saved}</span>
                </p>
                <Button
                  ref={changeButton}
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-full"
                  onClick={() => {
                    focusNext.current = "form";
                    setAddress({ ...EMPTY_ADDRESS, ...saved });
                  }}
                >
                  {COPY.delivery.change}
                </Button>
              </div>
            )}
            {draft !== null && (
              <div ref={formBox} className="flex flex-col gap-3">
                <AddressForm value={draft} onChange={setAddress} errors={typedErrors} />
                {saved && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 self-start rounded-full"
                    onClick={() => {
                      focusNext.current = "change";
                      setAddress(null);
                    }}
                  >
                    {COPY.delivery.useSaved}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Row>

        {rateList && rateList.length > 0 ? (
          <FieldRow label={COPY.delivery.shipping} problems={errors.shippingMethod?.message ? [errors.shippingMethod.message] : undefined}>
            {rateList.map((choice) => (
              <MethodChoice
                key={choice.key}
                rate={choice}
                currency={format.currency}
                checked={choice.key === shippingMethod}
                onChoose={(key) => {
                  setValue("shippingMethod", key, { shouldDirty: true });
                  clearErrors("shippingMethod");
                }}
              />
            ))}
          </FieldRow>
        ) : (
          <Row label={COPY.delivery.shipping}>
            {!ratesFor && !waiting && addresses.data && <p className="text-sm text-ink-2 md:pt-3">{COPY.delivery.needsAddress}</p>}
            {(waiting || (ratesFor && rates.isPending)) && <p className="text-sm text-ink-2 md:pt-3">{COPY.delivery.ratesLoading}</p>}
            {ratesFor && rates.isError && (
              <LoadFailure error={rates.error} fallback={COPY.delivery.ratesFailed} onRetry={() => void rates.refetch()} />
            )}
            {rateList?.length === 0 && <p className="text-sm text-ink-2 md:pt-3">{COPY.delivery.noRates}</p>}
          </Row>
        )}

        <FieldRow
          label={COPY.delivery.note}
          hint={COPY.delivery.noteCount(note.length)}
          problems={errors.note?.message ? [errors.note.message] : undefined}
        >
          {(props) => (
            <Textarea
              {...props}
              value={note}
              maxLength={MAX_NOTE}
              className="min-h-20 border-line bg-card text-ink focus-visible:border-violet focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet/30 aria-invalid:border-late aria-invalid:ring-0"
              onChange={(event) => {
                setValue("note", event.target.value, { shouldDirty: true });
                clearErrors("note");
              }}
            />
          )}
        </FieldRow>
      </fieldset>

      {failure && (
        <div
          ref={failureBox}
          role="alert"
          tabIndex={-1}
          className="rounded-lg bg-late/8 px-3.5 py-3 text-sm text-late-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
        >
          {failure.message}
        </div>
      )}

      {/* On a phone the total and Place order stay in view at the bottom while staff scroll the section. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-line bg-card px-4 py-3 sm:-mx-6 sm:px-6 md:static md:mx-0 md:flex-row md:items-start md:justify-between md:border-0 md:p-0">
        {total !== null ? (
          <p className="flex items-baseline justify-between gap-4 text-sm md:justify-start md:pt-3">
            <span className="text-ink-2">{COPY.delivery.total}</span>
            <span className="text-base font-semibold text-ink tabular-nums">{total}</span>
          </p>
        ) : (
          <span aria-hidden className="hidden md:block" />
        )}
        <div className="flex flex-col gap-2 md:items-end">
          {/* aria-disabled rather than disabled, so focus stays on the button while placing. */}
          <Button
            type="button"
            aria-disabled={blocked}
            aria-describedby={reason === null ? undefined : reasonId}
            className="min-h-11 w-full rounded-full md:w-auto aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-ink"
            onClick={place}
          >
            {placing.pending ? COPY.delivery.placing : COPY.delivery.place}
          </Button>
          {reason !== null && (
            <p id={reasonId} className="text-sm text-ink-2">
              {reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** A row laid out as `FieldRow`'s, for content that isn't one control or a set of radios. */
function Row({ label, labelId, children }: { label: string; labelId?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 md:grid md:grid-cols-[7rem_1fr] md:items-start md:gap-x-4">
      <span id={labelId} className="text-caption font-medium text-ink md:pt-4">
        {label}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </div>
  );
}

/** One shipping method as a radio with its price; one that can't be used is greyed, off, and says why. */
function MethodChoice({
  rate,
  currency,
  checked,
  onChoose,
}: {
  rate: ShippingRate;
  currency: string;
  checked: boolean;
  onChoose: (key: string) => void;
}) {
  const reasonId = useId();
  const usable = rate.available && rate.price !== null;
  const label = usable && rate.price !== null ? COPY.delivery.method(rate.name, formatMoney(rate.price, currency)) : rate.name;
  return (
    <div className="flex flex-col gap-1">
      <label
        className={cn(
          "flex min-h-11 items-center gap-2.5 rounded-lg border px-3 text-sm font-medium has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-violet",
          !usable && "cursor-not-allowed border-dashed border-line text-ink-2 opacity-60",
          usable && (checked ? "cursor-pointer border-ink bg-ink/4 text-ink" : "cursor-pointer border-line text-ink-2"),
        )}
      >
        <input
          type="radio"
          name="shipping-method"
          value={rate.key}
          checked={usable && checked}
          disabled={!usable}
          aria-describedby={rate.reason ? reasonId : undefined}
          onChange={() => onChoose(rate.key)}
          className="size-4 accent-ink"
        />
        {label}
      </label>
      {rate.reason && (
        <p id={reasonId} className="text-caption text-ink-2">
          {rate.reason}
        </p>
      )}
    </div>
  );
}
