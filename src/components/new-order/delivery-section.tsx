"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";

import { LoadFailure } from "@/components/data/load-failure";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Address, ShippingRate } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { ADDRESS_FIELDS, EMPTY_ADDRESS, MAX_NOTE, type AddressField, type NewOrderValues } from "@/lib/new-order/form";
import { cn } from "@/lib/utils";

import { AddressForm } from "./address-form";
import { COPY } from "./copy";
import { FieldRow } from "./field-row";
import type { Checkout } from "./use-checkout";
import type { Placing } from "./use-place";

/** The saved address on one line: "Luna Jewels, 12 rue des Orfèvres, 69002 Lyon, FR". */
export function addressLine(address: Address): string {
  return [address.name, address.line1, address.line2, `${address.postal_code} ${address.city}`, address.region, address.country]
    .filter((part) => part !== undefined && part.trim() !== "")
    .join(", ");
}

/**
 * The Delivery panel: where the order goes, how it ships, a note, the total before tax, and Place order. The
 * customer's saved address is used unless staff change it for this order; with none saved, the form is
 * open and must be filled in. Shipping is asked for once the address is the saved one or complete. The
 * address, its methods, the total and Place's reason come from `checkout`, worked out once by the page.
 */
export function DeliverySection({ checkout, placing }: { checkout: Checkout; placing: Placing }) {
  const { control, setValue, clearErrors } = useFormContext<NewOrderValues>();
  const [shippingMethod, note] = useWatch({ control, name: ["shippingMethod", "note"] });
  const { errors } = useFormState({ control });
  const format = useFormat();
  const reasonId = useId();
  const addressLabelId = useId();

  const { addresses, draft, setAddress, waiting, rates, ratesFor, rateList, rate, total, main } = checkout;
  const saved = addresses.data?.shipping_address ?? null;
  // Place is pressed here only while the main action is placing; before a price it stays off, unexplained,
  // as the price section says what to do next.
  const place = main.kind === "place" ? main : null;
  const blocked = place === null || place.off;
  const reason = place?.reason ?? null;

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
            {!ratesFor && !waiting && addresses.data && <p className="text-sm text-ink-2">{COPY.delivery.needsAddress}</p>}
            {(waiting || (ratesFor && rates.isPending)) && <p className="text-sm text-ink-2">{COPY.delivery.ratesLoading}</p>}
            {ratesFor && rates.isError && (
              <LoadFailure error={rates.error} fallback={COPY.delivery.ratesFailed} onRetry={() => void rates.refetch()} />
            )}
            {rateList?.length === 0 && <p className="text-sm text-ink-2">{COPY.delivery.noRates}</p>}
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
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-line bg-card px-4 py-3 sm:-mx-5 sm:px-5 md:static md:mx-0 md:flex-row md:items-start md:justify-between md:border-0 md:p-0">
        {/* Only the total with shipping shows here; the one before shipping is the ticket's. */}
        {total !== null && rate !== undefined ? (
          <p className="flex items-baseline justify-between gap-4 text-sm md:justify-start">
            <span className="text-ink-2">{total.label}</span>
            <span className="text-base font-semibold text-ink tabular-nums">{total.amount}</span>
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
            onClick={() => place?.run()}
          >
            {place?.label ?? COPY.delivery.place}
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
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-caption font-medium text-ink">
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
