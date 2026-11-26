"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Ban } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";

import { LoadFailure } from "@/components/data/load-failure";
import { CustomerInitials } from "@/components/orders/customer-initials";
import { MAX_SEARCH_LENGTH, useSearch } from "@/components/shell/command/use-search";
import { Button } from "@/components/ui/button";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import type { Customer } from "@/lib/api/schema-types";
import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";
import { useCustomer } from "@/lib/new-order/queries";

import { ChangeCustomerDialog } from "./change-customer-dialog";
import { COPY } from "./copy";

/** The chip's second line, group then plan: "Trade · Free"; "No group · Starter". */
export function customerChip(customer: Customer): string {
  return [customer.customer_group?.name ?? COPY.customer.noGroup, customer.plan.name].join(" · ");
}

/** A customer who can't be picked, named. */
function Disabled({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-ink">
      <Ban aria-hidden className="size-4 shrink-0" />
      {COPY.customer.disabled(name)}
    </p>
  );
}

/** Fields that stay when the customer changes, so having set them isn't worth asking about. */
const KEPT: ReadonlySet<string> = new Set<keyof NewOrderValues>(["customerId", "declaredUnit"]);

/**
 * The customer the order is for: a search until one is picked, then a chip with their initials, name,
 * group and plan, and Change, which shows the search again. Picking one loads their record and, once it
 * is active, sets it as the order's customer with every other field back to its empty value (the unit
 * the model is drawn in stays), since prices, products and files are the customer's own. Once anything
 * besides the customer is entered, picking another asks first. A disabled customer is named and never set.
 * `onCustomerChange` runs when the last customer's entries are cleared, so the page drops their price.
 */
export function CustomerSection({
  startWith = null,
  onCustomerChange,
}: {
  /** A customer to start with, from a customer's page: read once, when the section first shows. */
  startWith?: string | null;
  onCustomerChange?: () => void;
}) {
  const { control, reset, getValues } = useFormContext<NewOrderValues>();
  // Read while rendering, so the form keeps track of which fields were changed.
  const { dirtyFields } = useFormState({ control });
  const customerId = useWatch({ control, name: "customerId" });
  const [pickedId, setPickedId] = useState<string | null>(() => getValues("customerId") || startWith);
  // The customer the page started with is the form's default too, so leaving at once doesn't ask.
  const started = useRef(startWith);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  // Change pressed: the search shows again under the chip's place until a customer is picked or Escape.
  const [changing, setChanging] = useState(false);
  // Another customer picked while something is entered. Their record loads first, and the dialog asks only
  // once they're active: a disabled one is named and never clears the order started for this one.
  const [asking, setAsking] = useState<string | null>(null);
  const search = useSearch(text);
  const customer = useCustomer(pickedId);
  const loaded = customer.data;
  const candidate = useCustomer(asking);
  const candidateActive = asking !== null && candidate.data?.id === asking && candidate.data.status === "active";
  const input = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  // Where focus goes after the next commit: the search or the chip appear only then.
  const focusNext = useRef<"search" | "change" | null>(null);

  useEffect(() => {
    if (loaded?.status !== "active" || loaded.id !== pickedId || getValues("customerId") === loaded.id) return;
    // Picked here, the defaults stay empty, so the form counts as changed and the leave guard asks.
    // Started with from a customer's page, nothing was entered yet, so the customer becomes the default.
    const fromPage = started.current === loaded.id;
    started.current = null;
    reset({ ...EMPTY_VALUES, customerId: loaded.id, declaredUnit: getValues("declaredUnit") }, { keepDefaultValues: !fromPage });
  }, [loaded, pickedId, getValues, reset]);

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    // Waits for a commit where the target is on screen: after a change, the chip shows once the new
    // customer is set, a render after the switch.
    const node = (target === "search" ? input : changeButton).current;
    if (node === null) return;
    focusNext.current = null;
    node.focus();
  });

  /** Back to the chip of the customer already set, with focus on its Change. */
  function stay() {
    setAsking(null);
    setChanging(false);
    setText("");
    focusNext.current = "change";
  }

  function switchTo(id: string) {
    setPickedId(id);
    setChanging(false);
    if (getValues("customerId") === "") return;
    // Everything below belonged to the last customer; the new one is set once it has loaded and is active.
    reset({ ...EMPTY_VALUES, declaredUnit: getValues("declaredUnit") }, { keepDefaultValues: true });
    onCustomerChange?.();
  }

  function pick(id: string) {
    setText("");
    setOpen(false);
    if (id === pickedId) {
      stay();
      return;
    }
    const entered = Object.keys(dirtyFields).some((field) => !KEPT.has(field));
    if (getValues("customerId") !== "" && entered) setAsking(id);
    else {
      setAsking(null);
      switchTo(id);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (open) setOpen(false);
    else if (changing) stay();
  }

  const chosen = loaded?.status === "active" && loaded.id === customerId ? loaded : null;
  const trimmed = text.trim();
  const listing = open && trimmed !== "";
  const customers = search.data?.customers ?? [];
  const searchFailed = listing && search.isError && search.settled;
  const searching = listing && !searchFailed && (!search.settled || !search.data);
  const noMatch = listing && !searchFailed && !searching && customers.length === 0;

  return (
    <div className="flex flex-col">
      {/* The search is named by the Command's own label, the chip by its group; this is the visible one. */}
      <span aria-hidden className="pb-3 text-caption font-medium text-ink">
        {COPY.customer.label}
      </span>

      {chosen !== null && !changing ? (
        <div role="group" aria-label={COPY.customer.label} className="flex min-h-12 items-center gap-3">
          <CustomerInitials customer={chosen} className="size-10 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold break-words text-ink">{chosen.name}</p>
            <p className="text-sm text-ink-2">{customerChip(chosen)}</p>
          </div>
          <Button
            ref={changeButton}
            type="button"
            variant="outline"
            aria-label={COPY.customer.changeLabel}
            className="min-h-11 rounded-full"
            onClick={() => {
              setChanging(true);
              setText("");
              focusNext.current = "search";
            }}
          >
            {COPY.customer.change}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Command shouldFilter={false} label={COPY.customer.label} onKeyDown={onKeyDown} className="size-auto overflow-visible rounded-none! bg-transparent p-0">
            <CommandPrimitive.Input
              ref={input}
              value={text}
              onValueChange={(next) => {
                setText(next);
                setOpen(true);
              }}
              maxLength={MAX_SEARCH_LENGTH}
              placeholder={COPY.customer.placeholder}
              className="h-11 w-full min-w-0 rounded-lg border border-line bg-card px-3.5 text-base text-ink transition-colors placeholder:text-placeholder focus-visible:border-violet focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            />
            <CommandList className={listing && !searchFailed && customers.length > 0 && !searching ? "mt-2 rounded-lg border border-line bg-card p-1" : "hidden"}>
              {listing && search.settled && !search.isError && customers.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => pick(c.id)} className="min-h-11 text-base md:text-sm">
                  {c.name}
                </CommandItem>
              ))}
            </CommandList>
          </Command>

          {searching && <p className="text-sm text-ink-2">{COPY.customer.searching}</p>}
          {noMatch && <p className="text-sm text-ink-2">{COPY.customer.noMatch(trimmed)}</p>}
          {searchFailed && <LoadFailure error={search.error} fallback={COPY.customer.searchFailed} onRetry={() => void search.refetch()} />}
        </div>
      )}

      {/* Always rendered, so what appears in it is announced; it takes room only once it has something. */}
      <div aria-live="polite" className="flex flex-col gap-1 not-empty:mt-3">
        {pickedId !== null && customer.isPending && <p className="text-sm text-ink-2">{COPY.customer.loading}</p>}
        {pickedId !== null && customer.isError && (
          <LoadFailure error={customer.error} fallback={COPY.customer.loadFailed} onRetry={() => void customer.refetch()} />
        )}
        {loaded?.status === "disabled" && <Disabled name={loaded.name} />}
        {/* The customer picked to replace the one set, before the dialog asks. */}
        {asking !== null && candidate.isPending && <p className="text-sm text-ink-2">{COPY.customer.loading}</p>}
        {asking !== null && candidate.isError && (
          <LoadFailure error={candidate.error} fallback={COPY.customer.loadFailed} onRetry={() => void candidate.refetch()} />
        )}
        {asking !== null && candidate.data?.id === asking && candidate.data.status === "disabled" && <Disabled name={candidate.data.name} />}
      </div>

      <ChangeCustomerDialog
        open={candidateActive}
        keep={stay}
        change={() => {
          if (asking !== null) switchTo(asking);
          setAsking(null);
          // Their record is loaded, so their chip shows next: focus goes to its Change, then to the product
          // select once the products load. Never left on the page body if they have none.
          focusNext.current = "change";
        }}
      />
    </div>
  );
}
