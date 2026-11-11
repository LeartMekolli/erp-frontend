"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { z } from "zod";

import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { idempotent } from "@/lib/api/idempotency";
import { applyFieldErrors, isApiProblem, problemFrom } from "@/lib/api/problem";
import type { CancelOrderBody, Order, OrderLine } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { useFormat } from "@/lib/format/use-format";
import { invalidateOrders } from "@/lib/orders/queries";
import { invalidateProduction } from "@/lib/production/queries";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { DIALOG_SHEET } from "./dialog-classes";
import { submitErrorText } from "./submit-error";

// erp-api's rules (`orders/orders.service.ts:169-199`).
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const MAX_LINES = 50;
const REASON_MAX = 500;

interface Values {
  scope: "all" | "some";
  reason: string;
  refund: string;
  owed: Record<string, { amount: string; reason: string }>;
}

/** Whole cents as a bigint, so what's owed never goes through a fractional number. */
function cents(amount: string): bigint {
  const [whole = "0", fraction = ""] = amount.split(".");
  return BigInt(whole + fraction.padEnd(2, "0").slice(0, 2));
}

function amountOf(total: bigint): string {
  const text = total.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

const ZERO = BigInt(0);
const blank = (value: string | undefined) => !value?.trim();
const titleOf = (line: { quantity: number; product: { name: string } }) => `${line.quantity} × ${line.product.name}`;

interface OwedRow {
  key: string;
  position: number;
  part?: number;
  partnerName: string;
  title: string;
}

/** The lines and parts in these lines that a partner has accepted, each of which can be owed for its work. */
function owedRows(lines: OrderLine[]): OwedRow[] {
  return lines.flatMap((line) => {
    const own = line.partner?.status === "accepted" ? [{ key: `line_${line.position}`, position: line.position, partnerName: line.partner.name, title: titleOf(line) }] : [];
    const parts = line.parts.flatMap((part) =>
      part.partner?.status === "accepted" && part.state !== "cancelled"
        ? [{ key: `part_${line.position}_${part.position}`, position: line.position, part: part.position, partnerName: part.partner.name, title: titleOf(part) }]
        : [],
    );
    return [...own, ...parts];
  });
}

function schemaFor(open: OrderLine[], chosen: number[], paidLeft: bigint, maxRefund: string) {
  return z.custom<Values>().superRefine((values, context) => {
    const refuse = (path: string[], message: string) => context.addIssue({ code: "custom", path, message });
    const lines = values.scope === "all" ? open : open.filter((line) => chosen.includes(line.position));

    if (blank(values.reason)) refuse(["reason"], "Say why.");
    if (values.scope === "some" && lines.length === 0) refuse(["scope"], "Choose at least one line.");
    if (values.scope === "some" && lines.length > MAX_LINES) refuse(["scope"], `Choose at most ${MAX_LINES} lines.`);

    for (const row of owedRows(lines)) {
      const entry = values.owed[row.key];
      if (blank(entry?.amount)) continue;
      if (!MONEY.test(entry!.amount.trim())) refuse(["owed", row.key, "amount"], "Enter an amount such as 25.00.");
      else if (blank(entry!.reason)) refuse(["owed", row.key, "reason"], "Say why they're owed this.");
    }

    if (paidLeft > ZERO) {
      const refund = values.refund.trim();
      if (!refund) refuse(["refund"], "Enter what to refund, or 0.00 for nothing.");
      else if (!MONEY.test(refund)) refuse(["refund"], "Enter an amount such as 50.00.");
      else if (cents(refund) > paidLeft) refuse(["refund"], `Refund at most ${maxRefund}.`);
    }
  });
}

interface CancelProps {
  order: Order;
  onCancelled: (message: string) => void;
}

/** Cancels the whole order or chosen lines, until it ships (`POST /orders/{id}/cancel`). */
export function CancelDialog({ open, onOpenChange, ...form }: CancelProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHEET}>
        <CancelForm
          {...form}
          onCancelled={(message) => {
            onOpenChange(false);
            form.onCancelled(message);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CancelForm({ order, onCancelled }: CancelProps) {
  const client = useQueryClient();
  const { money } = useFormat();
  const mayRefund = useCan("payment.refund");
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const open = [...order.lines].sort((a, b) => a.position - b.position).filter((line) => line.state !== "cancelled");
  const paidLeft = cents(order.payment.paid) - cents(order.payment.refunded);
  const maxRefund = money(amountOf(paidLeft > ZERO ? paidLeft : ZERO), order.currency);
  const blocked = paidLeft > ZERO && !mayRefund;

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schemaFor(open, chosen, paidLeft, maxRefund)),
    defaultValues: { scope: "all", reason: "", refund: "", owed: {} },
  });
  const scope = useWatch({ control, name: "scope" });
  const lines = scope === "all" ? open : open.filter((line) => chosen.includes(line.position));
  const rows = owedRows(lines);
  const label = scope === "all" ? "Cancel order" : "Cancel lines";

  const cancel = useApiMutation<CancelOrderBody, Order>(
    async (body, key) => {
      const { data, error, response } = await api.POST("/orders/{id}/cancel", { params: { path: { id: order.id } }, body, ...idempotent(key) });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSettled: () => Promise.all([invalidateOrders(client), invalidateProduction(client)]) },
  );

  const onSubmit = async (values: Values) => {
    setMessage(null);
    const owed = rows.flatMap((row) => {
      const entry = values.owed[row.key];
      if (blank(entry?.amount)) return [];
      return [{ position: row.position, ...(row.part === undefined ? {} : { part: row.part }), amount: entry!.amount.trim(), reason: entry!.reason.trim() }];
    });
    const positions = lines.map((line) => line.position);
    let done: Order;
    try {
      done = await cancel.mutateAsync({
        reason: values.reason.trim(),
        ...(values.scope === "some" ? { lines: positions } : {}),
        ...(owed.length > 0 ? { partner_owed: owed } : {}),
        ...(paidLeft > ZERO ? { refund: { amount: values.refund.trim() } } : {}),
      });
    } catch (error) {
      if (isApiProblem(error) && error.status === 400) {
        const named = { ...error, errors: error.errors?.map((e) => (e.path === "refund.amount" ? { ...e, path: "refund" } : e)) };
        setMessage(applyFieldErrors(named, setError, ["reason", "refund"] as Path<Values>[]));
      } else setMessage(submitErrorText(error));
      return;
    }
    if (done.state === "cancelled") onCancelled(`#${order.number} cancelled.`);
    else onCancelled(`${positions.length} ${positions.length === 1 ? "line" : "lines"} cancelled on #${order.number}.`);
  };

  const toggle = (position: number) =>
    setChosen((current) => (current.includes(position) ? current.filter((other) => other !== position) : [...current, position]));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-base font-semibold">{`Cancel #${order.number}`}</DialogTitle>
        <DialogDescription className="text-sm text-ink-2">Unfinished pieces are cancelled and any open offer is withdrawn. This can&apos;t be undone.</DialogDescription>
      </div>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
        {message && <FormMessage tone="error">{message}</FormMessage>}
        {blocked && <FormMessage tone="error">This order has been paid, and cancelling it needs permission to refund it.</FormMessage>}
        <fieldset disabled={cancel.isPending} className="flex flex-col gap-4">
          {open.length > 1 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium text-ink">What to cancel</legend>
              <div className="flex flex-wrap gap-x-5">
                <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
                  <input type="radio" value="all" className="size-4 accent-violet" {...register("scope")} />
                  The whole order
                </label>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
                  <input type="radio" value="some" className="size-4 accent-violet" {...register("scope")} />
                  Some lines
                </label>
              </div>
              {scope === "some" && (
                <div className="flex flex-col">
                  {open.map((line) => (
                    <label key={line.id} className="inline-flex min-h-11 items-center gap-2 text-sm break-words text-ink">
                      <input type="checkbox" className="size-4 shrink-0 accent-violet" checked={chosen.includes(line.position)} onChange={() => toggle(line.position)} />
                      {titleOf(line)}
                    </label>
                  ))}
                </div>
              )}
              {errors.scope?.message && <p className="text-caption text-late">{errors.scope.message}</p>}
            </fieldset>
          )}

          <Field id="cancel-reason" label="Reason" error={errors.reason?.message}>
            {(props) => <Textarea {...props} {...register("reason")} maxLength={REASON_MAX} />}
          </Field>

          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-3">
              <Field id={`cancel-owed-${row.key}`} label={`Owed to ${row.partnerName} for ${row.title} (optional)`} hint="Nothing, if left empty." error={errors.owed?.[row.key]?.amount?.message}>
                {(props) => <Input {...props} {...register(`owed.${row.key}.amount`)} inputMode="decimal" autoComplete="off" />}
              </Field>
              <Field id={`cancel-owed-reason-${row.key}`} label={`Why ${row.partnerName} is owed this`} error={errors.owed?.[row.key]?.reason?.message}>
                {(props) => <Textarea {...props} {...register(`owed.${row.key}.reason`)} maxLength={REASON_MAX} />}
              </Field>
            </div>
          ))}

          {paidLeft > ZERO && mayRefund && (
            <Field id="cancel-refund" label="Refund" hint={`Up to ${maxRefund}. Enter 0.00 to refund nothing.`} error={errors.refund?.message}>
              {(props) => <Input {...props} {...register("refund")} inputMode="decimal" autoComplete="off" />}
            </Field>
          )}

          <Button type="submit" className="mt-1" disabled={blocked}>
            {cancel.isPending ? "Cancelling…" : label}
          </Button>
        </fieldset>
      </form>
    </>
  );
}
