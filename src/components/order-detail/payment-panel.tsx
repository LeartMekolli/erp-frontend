"use client";

import { cn } from "cn";
import type { ReactNode } from "react";

import type { Order } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { PAYMENT_LABEL } from "@/lib/orders/labels";

const TERMS: Record<Order["payment"]["terms"], string> = { pay_first: "Pay first", pay_later: "Pay later" };

/** A money string that is exactly zero, whatever its decimals. */
const isZero = (amount: string) => /^0+(\.0+)?$/.test(amount);

/** `20.00` reads 20, `7.50` reads 7.5. */
const percentText = (percent: string) => (percent.includes(".") ? percent.replace(/\.?0+$/, "") : percent);

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-[20px] bg-card px-5 py-4">
      <h2 className="text-caption font-medium text-ink-2">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4 border-t border-line py-1.5 first:border-t-0", strong && "font-semibold")}>
      <span className={cn(!strong && "text-ink-2")}>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

/** How the order is paid, and what it adds up to. */
export function PaymentPanel({ order }: { order: Order }) {
  const { money, day, dateTime } = useFormat();
  const { payment, currency } = order;
  const amount = (value: string) => money(value, currency);
  const label = PAYMENT_LABEL[payment.state];

  return (
    <Panel title="Payment">
      <p className="text-sm font-medium">
        {label ?? "Nothing to pay"}
        <span className="font-normal text-ink-2"> · {TERMS[payment.terms]}</span>
      </p>
      {payment.pay_by && <p className="text-caption text-ink-2">Pay by {dateTime(payment.pay_by)}, or the order is cancelled</p>}
      {payment.held_for_credit && <p className="text-caption font-medium">Waiting: the customer is past its credit limit</p>}
      {payment.released && (
        <p className="text-caption text-ink-2">
          Released by {payment.released.by.name}: {payment.released.reason}
        </p>
      )}
      <div className="text-sm">
        <Row label="Lines" value={amount(order.lines_total)} />
        <Row label="Shipping" value={amount(order.shipping.price)} />
        <Row label={`Tax ${percentText(order.tax.percent)}%`} value={amount(order.tax.amount)} />
        <Row label="Total" value={amount(order.total)} strong />
        {!isZero(payment.paid) && <Row label="Paid" value={amount(payment.paid)} />}
        {!isZero(payment.refunded) && <Row label="Refunded" value={amount(payment.refunded)} />}
        {payment.invoice && !isZero(payment.invoice.credited) && <Row label="Credited" value={amount(payment.invoice.credited)} />}
      </div>
      {payment.invoice && (
        <p className="text-caption text-ink-2">
          <a href={payment.invoice.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
            Invoice
          </a>{" "}
          · due {day(payment.invoice.due_on)}
        </p>
      )}
    </Panel>
  );
}
