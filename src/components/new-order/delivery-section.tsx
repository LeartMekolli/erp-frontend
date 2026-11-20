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
import { Panel } from "./panel";
import type { Checkout } from "./use-checkout";
import type { Placing } from "./use-place";

/** The saved address on two lines: "Luna Jewels" and "12 rue des Orfèvres, 69002 Lyon, FR". */
export function addressLines(address: Address): [string, string] {
  const rest = [address.line1, address.line2, `${address.postal_code} ${address.city}`, address.region, address.country]
    .filter((part) => part !== undefined && part.trim() !== "")
    .join(", ");
  return [address.name, rest];
}

/**
 * The Delivery panel, shown from the moment a customer is picked and kept open through every price:
 * where the order goes beside how it ships (two columns from `sm:`), then a note. The customer's saved
 * address is used unless staff change it for this order ("Change address", in the panel's title bar);
 * with none saved, the form is open and must be filled in. An open form takes the whole width, with the
 * methods under it. Shipping is asked for once the address is the saved one or complete. The address and
 * its methods come from `checkout`, worked out once by the page; the total and Place order are the
 * ticket's. Every field is locked while placing.
 */
export function DeliverySection({ checkout, placing }: { checkout: Checkout; placing: Pick<Placing, "pending"> }) {
  const { control, setValue, clearErrors } = useFormContext<NewOrderValues>();
  const [shippingMethod, note] = useWatch({ control, name: ["shippingMethod", "note"] });
  const { errors } = useFormState({ control });
  const format = useFormat();
  const addressLabelId = useId();

  const { addresses, draft, setAddress, waiting, rates, ratesFor, rateList } = checkout;
  const saved = addresses.data?.shipping_address ?? null;

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

  const addressErrors = errors.address as Partial<Record<AddressField, { message?: string }>> | undefined;
  const typedErrors: Partial<Record<AddressField, string>> = {};
  for (const field of ADDRESS_FIELDS) {
    const message = addressErrors?.[field]?.message;
    if (message) typedErrors[field] = message;
  }

  const usingSaved = draft === null && saved !== null;

  return (
    <Panel
      title={COPY.delivery.title}
      action={
        usingSaved ? (
          // In the title bar, outside the fieldset below, so it's locked while placing by itself.
          <Button
            ref={changeButton}
            type="button"
            variant="outline"
            disabled={placing.pending}
            className="min-h-11 rounded-full"
            onClick={() => {
              focusNext.current = "form";
              setAddress({ ...EMPTY_ADDRESS, ...saved });
            }}
          >
            {COPY.delivery.change}
          </Button>
        ) : undefined
      }
    >
      <fieldset disabled={placing.pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className={cn("flex min-w-0 flex-col gap-1.5", draft !== null && "sm:col-span-2")}>
            <span id={addressLabelId} className="text-caption font-medium text-ink">
              {usingSaved ? COPY.delivery.shipToSaved : COPY.delivery.shipTo}
            </span>
            <div role="group" aria-labelledby={addressLabelId} className="flex min-w-0 flex-col gap-3">
              {addresses.isPending && <p className="text-sm text-ink-2">{COPY.delivery.addressLoading}</p>}
              {addresses.isError && (
                <LoadFailure error={addresses.error} fallback={COPY.delivery.addressFailed} onRetry={() => void addresses.refetch()} />
              )}
              {usingSaved && (
                <address className="flex flex-col text-sm break-words text-ink not-italic">
                  <span className="font-medium">{addressLines(saved)[0]}</span>
                  <span className="text-ink-2">{addressLines(saved)[1]}</span>
                </address>
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
          </div>

          {rateList && rateList.length > 0 ? (
            <FieldRow
              label={COPY.delivery.shipping}
              problems={errors.shippingMethod?.message ? [errors.shippingMethod.message] : undefined}
              groupClassName="flex flex-col gap-2"
            >
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
        </div>

        <FieldRow
          label={COPY.delivery.note}
          // The count only once there is something to count.
          hint={note.length > 0 ? COPY.delivery.noteCount(note.length) : undefined}
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
    </Panel>
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

/**
 * One shipping method as a radio with its price at the right; one that can't be used is greyed, off, and
 * says why. The radio is named "Courier · €12.00" outright: its name and price are two separate spans.
 */
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
  const price = usable && rate.price !== null ? formatMoney(rate.price, currency) : null;
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
          aria-label={price === null ? undefined : COPY.delivery.method(rate.name, price)}
          aria-describedby={rate.reason ? reasonId : undefined}
          onChange={() => onChoose(rate.key)}
          className="size-4 accent-ink"
        />
        <span className="min-w-0 break-words">{rate.name}</span>
        {price !== null && <span className="ml-auto tabular-nums">{price}</span>}
      </label>
      {rate.reason && (
        <p id={reasonId} className="text-caption text-ink-2">
          {rate.reason}
        </p>
      )}
    </div>
  );
}
