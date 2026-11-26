"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { orderHref } from "@/components/orders/order-row";
import type { CustomerInvoice, CustomerMoney } from "@/lib/api/schema-types";
import { creditLimitText, termsText } from "@/lib/customers/labels";
import { useCustomerMoney } from "@/lib/customers/queries";
import { signOf } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";

import { dueText } from "./due";
import { Fact, Panel, PanelLoading } from "./panel";

/** An open invoice: its order, when it's due and its total, with the PDF where erp-api has one. */
function OpenInvoice({ invoice }: { invoice: CustomerInvoice }) {
  const { money } = useFormat();
  return (
    <li className="flex min-h-11 items-center gap-3 border-t border-line first:border-t-0 pointer-fine:min-h-9">
      <Link href={orderHref({ id: invoice.order_id })} className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-sm hover:underline">
        <span className="text-ink">
          #{invoice.order_number} <span className="text-caption text-ink-2">· due {dueText(invoice.due_on)}</span>
        </span>
        <span className="font-medium whitespace-nowrap tabular-nums text-ink">{money(invoice.total, invoice.currency)}</span>
      </Link>
      {invoice.url && (
        <a
          href={invoice.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Invoice PDF for order #${invoice.order_number}`}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink focus-visible:outline-2 focus-visible:outline-violet pointer-coarse:size-11"
        >
          <FileText aria-hidden className="size-4" />
        </a>
      )}
    </li>
  );
}

/** What the customer owes, its overdue and open invoices, and its terms. Staff with `payment.read` only. */
export function MoneyPanel({ customerId, action }: { customerId: string; action?: ReactNode }) {
  const query = useCustomerMoney(customerId, true);
  return (
    <Panel title="Money" action={action}>
      {query.isPending ? (
        <PanelLoading label="Loading the money" />
      ) : query.isError ? (
        <LoadFailure error={query.error} fallback="The money couldn't be loaded." onRetry={() => void query.refetch()} />
      ) : (
        <MoneyBody account={query.data} />
      )}
    </Panel>
  );
}

/** What's owed and the limit are in the account's `currency`; each invoice carries its own. */
function MoneyBody({ account }: { account: CustomerMoney }) {
  const { money } = useFormat();
  const { currency } = account;
  const owes = signOf(account.exposure) !== 0;
  const invoiced = account.balance !== account.exposure && signOf(account.balance) !== 0;
  const overdue = account.overdue_invoices;
  return (
    <>
      <p className="text-caption text-ink-2">Owes</p>
      <p className="text-[34px] leading-tight font-semibold tracking-tight text-ink tabular-nums">{money(account.exposure, currency)}</p>
      {!owes ? (
        <p className="text-caption text-ink-2">{account.terms === "pay_first" ? "Pays first. Nothing owed." : "Nothing owed."}</p>
      ) : (
        invoiced && <p className="text-caption text-ink-2">{money(account.balance, currency)} of it invoiced</p>
      )}

      {overdue.length > 0 && (
        <div className="mt-3.5 flex flex-col gap-1 rounded-xl bg-late/8 px-3 py-2.5">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-late-ink">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-late" />
            {overdue.length === 1 ? "1 invoice overdue" : `${overdue.length} invoices overdue`}
          </p>
          <ul className="flex flex-col gap-0.5 pl-4">
            {overdue.map((invoice) => (
              <li key={invoice.order_id}>
                <Link href={orderHref({ id: invoice.order_id })} className="text-sm font-medium text-late-ink underline decoration-late/35 underline-offset-3">
                  #{invoice.order_number} · {money(invoice.total, invoice.currency)} · due {dueText(invoice.due_on)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {account.open_invoices.length > 0 && (
        <div className="mt-3.5">
          <p className="text-caption text-ink-2">Open invoices</p>
          <ul>
            {account.open_invoices.map((invoice) => (
              <OpenInvoice key={invoice.order_id} invoice={invoice} />
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-3.5 flex flex-col gap-2 border-t border-line pt-3">
        <Fact term="Terms" inline>
          {termsText(account)}
        </Fact>
        {account.terms === "pay_later" && (
          <Fact term="Credit limit" inline>
            {creditLimitText(account.credit_limit, currency)}
          </Fact>
        )}
      </dl>
    </>
  );
}
