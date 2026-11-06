"use client";

import { ArrowUpDown, ListFilter, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OrderCounts, OrderSort, PaymentState } from "@/lib/api/schema-types";
import { formatDay } from "@/lib/format/dates";
import { NEEDS_LABEL, PAYMENT_LABEL, TAB_LABEL } from "@/lib/orders/labels";
import { useOrderCounts } from "@/lib/orders/queries";
import { ORDER_SORTS, PAYMENT_STATES, TABS, countsQuery, defaultSort, type OrdersView, type Tab } from "@/lib/orders/view";

import type { ViewChange } from "./use-orders-view";

const SORT_LABEL: Record<OrderSort, string> = {
  promised_on: "Promised date",
  "-promised_on": "Promised date, latest first",
  "-placed_at": "Newest",
  placed_at: "Oldest",
};

/** Search waits this long after the last key. */
const SEARCH_DEBOUNCE_MS = 300;

const PAYMENT_FILTERS = PAYMENT_STATES.filter((state) => PAYMENT_LABEL[state] !== null);

function tabCount(counts: OrderCounts, tab: Tab): number {
  if (tab === "needs") return counts.needs_you.total;
  if (tab === "all") return counts.all;
  return counts.states[tab];
}

/** Tabs with counts, the picked reason, filters, search and sort above the Orders table. */
export function Toolbar({ view, onChange }: { view: OrdersView; onChange: (change: ViewChange) => void }) {
  const counts = useOrderCounts(countsQuery(view));
  const sort = view.sort ?? defaultSort(view.tab);

  return (
    <div className="flex flex-col gap-2 border-b border-line">
      <div className="flex flex-col gap-2 px-2 pt-2 lg:flex-row lg:items-center">
        <Tabs value={view.tab} onValueChange={(tab) => onChange({ tab: tab as Tab })} activationMode="manual" className="min-w-0">
          <TabsList
            variant="line"
            aria-label="Orders by state"
            className="-mb-px h-auto! w-full justify-start overflow-x-auto [scrollbar-width:none]"
          >
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                // Every tab filters the one list below rather than showing a panel of its own.
                aria-controls="order-list"
                // The underline sits inside the tab, so the row can scroll sideways at every size without clipping it.
                className="h-11 flex-none px-3 text-ink-2 group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-ink"
              >
                {TAB_LABEL[tab]}
                {counts.data && (
                  <>
                    {" "}
                    <span className="rounded-full bg-line px-1.5 text-xs font-medium text-ink-2 tabular-nums in-data-active:bg-lilac in-data-active:text-violet-ink">
                      {tabCount(counts.data, tab)}
                    </span>
                  </>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2 pb-2 lg:ml-auto lg:flex-nowrap lg:pb-0">
          <SearchField q={view.q} onSearch={(q) => onChange({ q })} />
          <FilterButton view={view} onChange={onChange} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" aria-label={`Sort: ${SORT_LABEL[sort]}`} className="h-11 px-3 font-medium md:h-9 pointer-coarse:h-11">
                <ArrowUpDown aria-hidden />
                <span className="hidden sm:inline">{SORT_LABEL[sort]}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
              <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onChange({ sort: value as OrderSort })}>
                {ORDER_SORTS.map((value) => (
                  <DropdownMenuRadioItem key={value} value={value} className="min-h-11 md:min-h-9">
                    {SORT_LABEL[value]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Chips view={view} onChange={onChange} />
    </div>
  );
}

function Chip({ label, name, onRemove }: { label: string; name: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remove filter: ${name}`}
      onClick={onRemove}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-caption font-medium text-ink hover:bg-ground focus-visible:outline-2 focus-visible:outline-violet md:min-h-8 pointer-coarse:min-h-11"
    >
      {label}
      <X aria-hidden className="size-3.5 text-ink-2" />
    </button>
  );
}

function Chips({ view, onChange }: { view: OrdersView; onChange: (change: ViewChange) => void }) {
  const { reason, payment, from, to } = view;
  if (!reason && payment.length === 0 && !from && !to) return null;
  let promised: string | null = null;
  if (from && to) promised = `Promised ${formatDay(from)} to ${formatDay(to)}`;
  else if (from) promised = `Promised from ${formatDay(from)}`;
  else if (to) promised = `Promised until ${formatDay(to)}`;

  return (
    <div className="flex flex-wrap gap-2 px-3 pb-3">
      {reason && <Chip label={NEEDS_LABEL[reason]} name={NEEDS_LABEL[reason]} onRemove={() => onChange({ reason: null })} />}
      {payment.map((state) => {
        const label = PAYMENT_LABEL[state] ?? state;
        return (
          <Chip
            key={state}
            label={label}
            name={label}
            onRemove={() => onChange({ payment: payment.filter((other) => other !== state) })}
          />
        );
      })}
      {promised && <Chip label={promised} name="Promised" onRemove={() => onChange({ from: null, to: null })} />}
    </div>
  );
}

function SearchField({ q, onSearch }: { q: string | null; onSearch: (q: string | null) => void }) {
  const [text, setText] = useState(q ?? "");
  const [pending, setPending] = useState(false);
  const [seenQ, setSeenQ] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The URL changed from elsewhere (Back, a tile): show it, unless the person is mid-typing.
  if (q !== seenQ) {
    setSeenQ(q);
    if (!pending) setText(q ?? "");
  }

  useEffect(() => {
    const pendingSearch = timer;
    return () => clearTimeout(pendingSearch.current);
  }, []);

  function type(value: string) {
    setText(value);
    setPending(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPending(false);
      onSearch(value.trim() || null);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clear() {
    clearTimeout(timer.current);
    setPending(false);
    setText("");
    onSearch(null);
  }

  return (
    <label className="relative flex min-w-0 flex-1 items-center lg:w-64 lg:flex-none">
      <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-ink-2" />
      <input
        type="search"
        aria-label="Search orders"
        placeholder="Order number or customer"
        value={text}
        onChange={(event) => type(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            event.preventDefault();
            clear();
          }
        }}
        className="h-11 w-full rounded-lg border border-line bg-card pr-3 pl-9 text-base text-ink placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-violet md:h-9 md:text-sm pointer-coarse:h-11"
      />
    </label>
  );
}

function FilterButton({ view, onChange }: { view: OrdersView; onChange: (change: ViewChange) => void }) {
  const id = useId();
  const [toError, setToError] = useState(false);

  function togglePayment(state: PaymentState, on: boolean) {
    onChange({ payment: on ? [...view.payment, state] : view.payment.filter((other) => other !== state) });
  }

  function setTo(value: string) {
    if (value && view.from && value < view.from) {
      setToError(true);
      return;
    }
    setToError(false);
    onChange({ to: value || null });
  }

  return (
    <Popover onOpenChange={() => setToError(false)}>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="h-11 px-3 font-medium md:h-9 pointer-coarse:h-11">
          <ListFilter aria-hidden />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Filter" className="w-72 gap-4 rounded-xl p-4">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-caption font-medium text-ink-2">Payment</legend>
          {PAYMENT_FILTERS.map((state) => (
            <div key={state} className="flex min-h-9 items-center gap-2.5 pointer-coarse:min-h-11">
              <Checkbox
                id={`${id}-${state}`}
                checked={view.payment.includes(state)}
                onCheckedChange={(checked) => togglePayment(state, checked === true)}
              />
              <label htmlFor={`${id}-${state}`} className="text-sm text-ink">
                {PAYMENT_LABEL[state]}
              </label>
            </div>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-caption font-medium text-ink-2">Promised</legend>
          <label className="flex flex-col gap-1 text-sm text-ink">
            Promised from
            <input
              type="date"
              defaultValue={view.from ?? ""}
              onChange={(event) => onChange({ from: event.target.value || null })}
              className="h-11 rounded-lg border border-line px-3 text-base focus-visible:outline-2 focus-visible:outline-violet md:h-9 md:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            Promised to
            <input
              type="date"
              defaultValue={view.to ?? ""}
              min={view.from ?? undefined}
              aria-invalid={toError || undefined}
              aria-describedby={toError ? `${id}-to-error` : undefined}
              onChange={(event) => setTo(event.target.value)}
              className="h-11 rounded-lg border border-line px-3 text-base focus-visible:outline-2 focus-visible:outline-violet aria-invalid:border-late md:h-9 md:text-sm"
            />
          </label>
          {toError && (
            <p id={`${id}-to-error`} className="text-caption text-late-ink">
              Pick a day on or after the first.
            </p>
          )}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
