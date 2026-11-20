"use client";

import { useEffect, useId, useRef, type ReactNode, type Ref } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { FormMessage } from "@/components/auth/form-message";
import { CustomerInitials } from "@/components/orders/customer-initials";
import { Button } from "@/components/ui/button";
import type { CatalogProduct, OptionGroup, QuoteRefusal, QuoteSummary, SpeedChoice } from "@/lib/api/schema-types";
import { LOCALE } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { optionFields, quantityError, type NewOrderValues } from "@/lib/new-order/form";
import { modelMeasures } from "@/lib/new-order/model";
import { useCustomer, useCustomerProducts, useDeliverySpeeds, useOptionGroups } from "@/lib/new-order/queries";
import { useOnline } from "@/lib/query/use-online";
import type { FileMeasure } from "@/lib/upload/upload";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import type { Checkout } from "./use-checkout";
import type { Placing } from "./use-place";
import type { Price } from "./use-price";

/** How often the hold line checks whether the price has run out. */
const EXPIRY_TICK_MS = 30_000;

/** What the ticket needs of the held model: its file and, once measured, what the server measured. */
export interface TicketModel {
  held: File | null;
  upload: { measures: readonly FileMeasure[] };
}

/**
 * The chosen option values, size and speed, joined: "Silver 925 · Raw · M · Standard". Options follow
 * the product's own order; a value, size or speed not chosen yet is left out.
 */
export function ticketLine(
  values: Pick<NewOrderValues, "options" | "size" | "speed">,
  product: CatalogProduct,
  groups: OptionGroup[],
  speeds: readonly SpeedChoice[] = [],
): string {
  const parts: string[] = [];
  for (const field of optionFields(product, groups)) {
    const value = field.values.find((candidate) => candidate.key === values.options[field.key]);
    if (value) parts.push(value.name);
  }
  const size = values.size.trim();
  if (size !== "" && product.sizing.mode === "named") parts.push(size);
  if (size !== "" && product.sizing.mode === "range") parts.push(COPY.ticket.size(size));
  const speed = speeds.find((choice) => choice.key === values.speed);
  if (speed) parts.push(speed.name);
  return parts.join(" · ");
}

/**
 * The order ticket: who it is for, what is being ordered, the price and total, how the customer pays,
 * and the one main button with the reason it is off. It shows only what the page worked out
 * (`checkout`, `price`, `placing`); it holds no state of its own besides where focus went.
 *
 * Refusals, a price that changed at placing and a failed Place each take focus once when they arrive,
 * so staff hear them. In the narrow layout the ticket mounts when its sheet opens, which the page does
 * for each of them, so focus lands in view.
 */
export function OrderTicket({ checkout, price, placing, model }: { checkout: Checkout; price: Price; placing: Placing; model: TicketModel }) {
  const online = useOnline();
  const refusedId = useId();
  const refusedList = useRef<HTMLDivElement>(null);
  const focusedFor = useRef<readonly QuoteRefusal[] | null>(null);
  const changedNotice = useRef<HTMLDivElement>(null);
  const focusedChange = useRef<QuoteSummary | null>(null);
  const failureBox = useRef<HTMLDivElement>(null);
  const { refusals, shown } = price;
  const changedQuote = shown?.changed ? shown.quote : null;
  const { failure } = placing;

  // Focus goes to each new set of refusals once; the same answer showing again (a field changed, then
  // changed back) leaves focus where staff are typing.
  useEffect(() => {
    if (refusals.length === 0 || focusedFor.current === refusals) return;
    focusedFor.current = refusals;
    refusedList.current?.focus();
  }, [refusals]);

  // A price that changed at placing takes focus once, so staff read the new price before placing again.
  // A `price_changed` with no quote shows refusals, focused by the effect above.
  useEffect(() => {
    if (changedQuote === null || focusedChange.current === changedQuote) return;
    focusedChange.current = changedQuote;
    changedNotice.current?.focus();
  }, [changedQuote]);

  // Each refusal at Place that isn't about the price moves focus to its message.
  useEffect(() => {
    if (failure) failureBox.current?.focus();
  }, [failure]);

  return (
    <div className="flex flex-col gap-4">
      <TicketWhat model={model} />

      {refusals.length > 0 && (
        <div
          ref={refusedList}
          role="group"
          aria-labelledby={refusedId}
          tabIndex={-1}
          className="flex flex-col gap-1.5 rounded-lg bg-late/8 px-3.5 py-3 text-sm text-late-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
        >
          <p id={refusedId} className="font-medium">
            {COPY.price.refused}
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {refusals.map((reason, index) => (
              <li key={`${reason.code}:${index}`}>{reason.message}</li>
            ))}
          </ul>
        </div>
      )}

      {changedQuote && (
        <div
          ref={changedNotice}
          tabIndex={-1}
          className="rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
        >
          <FormMessage tone="info">{COPY.price.changed}</FormMessage>
        </div>
      )}

      {/* Only the price is announced as it arrives, and it is busy while asked for. The buttons, notes and
          boxes that take focus stay outside, or a screen reader would read them twice. */}
      <div aria-live="polite" aria-busy={price.pending} className="flex flex-col gap-3 border-t border-line pt-4">
        <TicketPrice checkout={checkout} price={price} />
      </div>

      {online && price.error && <FormMessage tone="error">{price.error}</FormMessage>}

      <PaymentNote />

      <MainButton main={checkout.main} className="w-full" />

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
    </div>
  );
}

/** The one main button, `aria-disabled` rather than disabled so focus stays on it, with its reason under it. */
export function MainButton({ main, className, buttonRef }: { main: Checkout["main"]; className?: string; buttonRef?: Ref<HTMLButtonElement> }) {
  const reasonId = useId();
  return (
    <div className="flex flex-col gap-2">
      <Button
        ref={buttonRef}
        type="button"
        aria-disabled={main.off}
        aria-describedby={main.reason === null ? undefined : reasonId}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        className={cn("min-h-11 rounded-full aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-ink", className)}
        onClick={() => main.run()}
      >
        {main.label}
      </Button>
      {main.reason !== null && (
        <p id={reasonId} className="text-sm text-ink-2">
          {main.reason}
        </p>
      )}
    </div>
  );
}

/** Who the order is for and what is in it, each part as soon as it is chosen. */
function TicketWhat({ model }: { model: TicketModel }) {
  const { control } = useFormContext<NewOrderValues>();
  const [customerId, productId, options, size, quantity, speed] = useWatch({
    control,
    name: ["customerId", "productId", "options", "size", "quantity", "speed"],
  });
  const customer = useCustomer(customerId || null).data;
  const products = useCustomerProducts(customerId || null);
  const groups = useOptionGroups();
  const speeds = useDeliverySpeeds(customerId || null);
  const product = products.data?.find((candidate) => candidate.id === productId);
  const line = product && groups.data ? ticketLine({ options, size, speed }, product, groups.data, speeds.data) : "";
  const volume = modelMeasures(model.upload.measures).volume;

  const who = customer?.status === "active" && customer.id === customerId ? customer : null;
  if (who === null && !product && model.held === null) return null;

  return (
    <div className="flex flex-col gap-2 text-sm">
      {who && (
        <p className="flex items-center gap-2 font-medium text-ink">
          <CustomerInitials customer={who} />
          <span className="min-w-0 break-words">{who.name}</span>
        </p>
      )}
      {product && (
        <div className="flex flex-col gap-0.5">
          <p className="font-medium break-words text-ink">
            {quantityError(quantity) === null ? COPY.ticket.what(Number(quantity).toLocaleString(LOCALE), product.name) : product.name}
          </p>
          {line !== "" && <p className="break-words text-ink-2">{line}</p>}
        </div>
      )}
      {model.held && (
        <p className="break-words text-ink-2">
          {model.held.name}
          {volume && <span className="tabular-nums">{` · ${volume}`}</span>}
        </p>
      )}
    </div>
  );
}

/** The price lines and total of the shown quote; the struck-through total of a stale one; or no price yet. */
function TicketPrice({ checkout, price }: { checkout: Checkout; price: Price }) {
  const format = useFormat();
  const { shown, stale } = price;
  const { total, rate } = checkout;

  if (shown) {
    const { quote } = shown;
    const money = (amount: string) => format.money(amount, quote.currency);
    return (
      <>
        <dl className="flex flex-col gap-1.5 text-sm">
          {quote.lines.map((line, index) => (
            <Row key={`${line.label}:${index}`} label={COPY.price.lines[line.label]} amount={money(line.amount)} />
          ))}
          <Row label={COPY.price.unitPrice} amount={money(quote.unit_price)} strong />
          <Row label={COPY.price.times(quote.quantity.toLocaleString(LOCALE), money(quote.unit_price))} amount={money(quote.total)} strong />
          {rate && rate.price !== null && <Row label={rate.name} amount={money(rate.price)} />}
        </dl>
        {total && <Total label={total.label} amount={total.amount} />}
        <Hold quote={quote} />
      </>
    );
  }

  if (stale) {
    return (
      <>
        <p className="text-display font-semibold text-ink-2 tabular-nums line-through">{format.money(stale.total, stale.currency)}</p>
        <Status dot="bg-collect">{COPY.ticket.changed}</Status>
      </>
    );
  }

  return <p className="text-sm text-ink-2">{COPY.ticket.noPrice}</p>;
}

function Total({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="text-display font-semibold text-ink tabular-nums">{amount}</p>
    </div>
  );
}

/**
 * Until when the quote's price holds, or that it has run out: placing then prices it again. `small` is
 * the dock's size.
 */
export function Hold({ quote, small = false }: { quote: QuoteSummary; small?: boolean }) {
  const format = useFormat();
  const now = useNow(EXPIRY_TICK_MS);
  const expired = quote.expired || now >= Date.parse(quote.expires_at);
  return expired ? (
    <Status dot="bg-collect" small={small}>
      {COPY.price.expired}
    </Status>
  ) : (
    <Status dot="bg-ship" small={small}>
      {COPY.ticket.holds(format.dateTime(quote.expires_at))}
    </Status>
  );
}

/** A status as a dot and its words; the dot is decoration, the words carry it. `small` is the dock's size. */
export function Status({ dot, small = false, children }: { dot: string; small?: boolean; children: ReactNode }) {
  return (
    <p className={cn("flex items-center gap-2 text-ink-2", small ? "text-caption" : "text-sm")}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />
      <span>{children}</span>
    </p>
  );
}

/** How the picked customer pays, in lilac, once their record has loaded. */
function PaymentNote() {
  const { control } = useFormContext<NewOrderValues>();
  const customerId = useWatch({ control, name: "customerId" });
  const customer = useCustomer(customerId || null).data;
  if (customer?.status !== "active" || customer.id !== customerId) return null;
  const terms = customer.payment_terms;
  return (
    <p className="rounded-lg bg-lilac px-3.5 py-3 text-sm text-violet-ink">
      {terms.terms === "pay_first" ? COPY.ticket.paysFirst(customer.name) : COPY.ticket.paysLater(terms.days_to_pay)}
    </p>
  );
}

function Row({ label, amount, strong = false }: { label: string; amount: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-medium text-ink" : "text-ink-2"}>{label}</dt>
      <dd className={strong ? "font-semibold text-ink tabular-nums" : "text-ink tabular-nums"}>{amount}</dd>
    </div>
  );
}
