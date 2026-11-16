"use client";

import { useEffect, useId, useRef } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import type { QuoteRefusal, QuoteSummary } from "@/lib/api/schema-types";
import { LOCALE } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { useOnline } from "@/lib/query/use-online";
import { useNow } from "@/lib/use-now";

import { COPY } from "./copy";
import type { Price } from "./use-price";

/** How often the price checks whether its hold has run out. */
const EXPIRY_TICK_MS = 30_000;

/**
 * Section 3: the price of what is on screen, asked only when staff press Get price. A price shows as
 * the customer would see it; a refused configuration lists why, and focus moves to that list.
 */
export function PriceSection({ price }: { price: Price }) {
  const online = useOnline();
  const noteId = useId();
  const refusedId = useId();
  const refusedList = useRef<HTMLDivElement>(null);
  const focusedFor = useRef<readonly QuoteRefusal[] | null>(null);
  const { refusals, shown } = price;

  // Focus goes to each new set of refusals once; the same answer showing again (a field changed, then
  // changed back) leaves focus where staff are typing.
  useEffect(() => {
    if (refusals.length === 0 || focusedFor.current === refusals) return;
    focusedFor.current = refusals;
    refusedList.current?.focus();
  }, [refusals]);

  const blocked = !price.ready || price.pending || !online;

  return (
    <div className="flex flex-col gap-4">
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

      {shown && <Quote quote={shown.quote} changed={shown.changed} />}

      {online && price.error && <FormMessage tone="error">{price.error}</FormMessage>}

      <div className="flex flex-col items-start gap-2">
        {/* aria-disabled rather than disabled, so focus stays on the button while the price is asked for. */}
        <Button
          type="button"
          aria-disabled={blocked}
          aria-describedby={online ? undefined : noteId}
          className="min-h-11 rounded-full aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-ink"
          onClick={() => {
            if (!blocked) price.getPrice();
          }}
        >
          {price.pending ? COPY.price.getting : COPY.price.get}
        </Button>
        {!online && (
          <p id={noteId} className="text-sm text-ink-2">
            {COPY.price.offline}
          </p>
        )}
      </div>
    </div>
  );
}

/** One quote's summary lines, unit price and total, and until when it holds. */
function Quote({ quote, changed }: { quote: QuoteSummary; changed: boolean }) {
  const format = useFormat();
  const now = useNow(EXPIRY_TICK_MS);
  const expired = quote.expired || now >= Date.parse(quote.expires_at);
  const money = (amount: string) => format.money(amount, quote.currency);

  return (
    <div className="flex flex-col gap-3">
      {changed && <FormMessage tone="info">{COPY.price.changed}</FormMessage>}
      <dl className="flex flex-col gap-1.5 text-sm">
        {quote.lines.map((line, index) => (
          <Row key={`${line.label}:${index}`} label={COPY.price.lines[line.label]} amount={money(line.amount)} />
        ))}
        <Row label={COPY.price.unitPrice} amount={money(quote.unit_price)} strong />
        <Row label={COPY.price.times(quote.quantity.toLocaleString(LOCALE))} amount={money(quote.total)} strong />
      </dl>
      <p className="text-sm text-ink-2">{expired ? COPY.price.expired : COPY.price.holdsUntil(format.dateTime(quote.expires_at))}</p>
    </div>
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
