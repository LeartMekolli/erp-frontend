"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Ban } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useFormContext } from "react-hook-form";

import { LoadFailure } from "@/components/data/load-failure";
import { MAX_SEARCH_LENGTH, useSearch } from "@/components/shell/command/use-search";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import type { Customer } from "@/lib/api/schema-types";
import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";
import { useCustomer } from "@/lib/new-order/queries";

import { COPY } from "./copy";

/** "Group: Trade · Pays first · Plan: Free"; "No group · Pays later, 30 days · Plan: Starter". */
export function customerSummary(customer: Customer): string {
  const { customer_group: group, payment_terms: terms, plan } = customer;
  const pays =
    terms.terms === "pay_first" ? COPY.customer.paysFirst : `Pays later, ${terms.days_to_pay} ${terms.days_to_pay === 1 ? "day" : "days"}`;
  return [group ? `Group: ${group.name}` : COPY.customer.noGroup, pays, COPY.customer.plan(plan.name)].join(" · ");
}

/**
 * Section 1: search for the customer the order is for. Picking one loads their record and, once it is
 * active, sets it as the order's customer with every other field back to its empty value, since prices,
 * products and files are the customer's own. A disabled customer is named and never set.
 */
export function CustomerSection() {
  const { reset, getValues } = useFormContext<NewOrderValues>();
  const [pickedId, setPickedId] = useState<string | null>(() => getValues("customerId") || null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const search = useSearch(text);
  const customer = useCustomer(pickedId);
  const loaded = customer.data;

  useEffect(() => {
    if (loaded?.status !== "active" || getValues("customerId") === loaded.id) return;
    // The defaults stay empty, so the form counts as changed and the leave guard asks.
    reset({ ...EMPTY_VALUES, customerId: loaded.id }, { keepDefaultValues: true });
  }, [loaded, getValues, reset]);

  function pick(id: string, name: string) {
    setText(name);
    setOpen(false);
    if (id === pickedId) return;
    setPickedId(id);
    // Everything below belonged to the last customer; the new one is set once it has loaded and is active.
    if (getValues("customerId") !== "") reset(EMPTY_VALUES, { keepDefaultValues: true });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") setOpen(false);
  }

  const trimmed = text.trim();
  const asking = open && trimmed !== "";
  const customers = search.data?.customers ?? [];
  const searchFailed = asking && search.isError && search.settled;
  const searching = asking && !searchFailed && (!search.settled || !search.data);
  const noMatch = asking && !searchFailed && !searching && customers.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <Command shouldFilter={false} label={COPY.customer.label} onKeyDown={onKeyDown} className="size-auto overflow-visible rounded-none! bg-transparent p-0">
        <CommandPrimitive.Input
          value={text}
          onValueChange={(next) => {
            setText(next);
            setOpen(true);
          }}
          maxLength={MAX_SEARCH_LENGTH}
          placeholder={COPY.customer.placeholder}
          className="h-11 w-full min-w-0 rounded-lg border border-line bg-card px-3.5 text-base text-ink transition-colors placeholder:text-placeholder focus-visible:border-violet focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
        <CommandList className={asking && !searchFailed && customers.length > 0 && !searching ? "mt-2 rounded-lg border border-line bg-card p-1" : "hidden"}>
          {asking && search.settled && !search.isError && customers.map((c) => (
            <CommandItem key={c.id} value={c.id} onSelect={() => pick(c.id, c.name)} className="min-h-11 text-base md:text-sm">
              {c.name}
            </CommandItem>
          ))}
        </CommandList>
      </Command>

      {searching && <p className="text-sm text-ink-2">{COPY.customer.searching}</p>}
      {noMatch && <p className="text-sm text-ink-2">{COPY.customer.noMatch(trimmed)}</p>}
      {searchFailed && <LoadFailure error={search.error} fallback={COPY.customer.searchFailed} onRetry={() => void search.refetch()} />}

      <div aria-live="polite" className="flex flex-col gap-1">
        {pickedId !== null && customer.isPending && <p className="text-sm text-ink-2">{COPY.customer.loading}</p>}
        {pickedId !== null && customer.isError && (
          <LoadFailure error={customer.error} fallback={COPY.customer.loadFailed} onRetry={() => void customer.refetch()} />
        )}
        {loaded?.status === "disabled" && (
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Ban aria-hidden className="size-4 shrink-0" />
            {COPY.customer.disabled(loaded.name)}
          </p>
        )}
        {loaded?.status === "active" && (
          <>
            <p className="text-base font-semibold text-ink">{loaded.name}</p>
            <p className="text-sm text-ink-2">{customerSummary(loaded)}</p>
          </>
        )}
      </div>
    </div>
  );
}
