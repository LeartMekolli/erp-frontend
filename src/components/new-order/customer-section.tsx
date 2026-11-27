"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { Ban, Plus } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";

import { CreatedNotice } from "@/components/customers/created-notice";
import { LoadFailure } from "@/components/data/load-failure";
import { CustomerInitials } from "@/components/orders/customer-initials";
import { MAX_SEARCH_LENGTH, useSearch } from "@/components/shell/command/use-search";
import { Button } from "@/components/ui/button";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import type { CreatedCustomer, Customer, SentInvitation } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";
import { newOrderKeys, useCustomer } from "@/lib/new-order/queries";

import { ChangeCustomerDialog } from "./change-customer-dialog";
import { COPY } from "./copy";
import { NewCustomerPanel, type MadeCustomer } from "./new-customer-panel";

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
 * When the search finds nobody, staff who may make customers get New customer, a side panel over the
 * order that starts from the typed text; the customer it creates is picked as if found, and what became of
 * their invitation shows under the chip until another customer is picked.
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
  // New customer's panel is open with this name to start from.
  const [newName, setNewName] = useState<string | null>(null);
  // The customer just made in the panel, kept for its notice, in the panel or under their chip. Send again's
  // answer is kept here too, so it isn't lost when the notice moves from one to the other.
  const [created, setCreated] = useState<MadeCustomer | null>(null);
  // Made in the panel that's open now, while the order kept the customer it had: the panel shows its notice.
  const [madeHere, setMadeHere] = useState<string | null>(null);
  const mayCreate = useCan("customer.write");
  const client = useQueryClient();
  const search = useSearch(text);
  const customer = useCustomer(pickedId);
  const loaded = customer.data;
  const candidate = useCustomer(asking);
  const candidateActive = asking !== null && candidate.data?.id === asking && candidate.data.status === "active";
  const input = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const panelNotice = useRef<HTMLDivElement | null>(null);
  // Where focus goes after the next commit: the search, the chip or the panel's notice appear only then.
  const focusNext = useRef<"search" | "change" | "notice" | null>(null);

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
    const node = target === "search" ? input.current : target === "change" ? changeButton.current : panelNotice.current;
    if (node === null) return;
    focusNext.current = null;
    node.focus();
  });

  /**
   * Back to the chip of the customer already set, with focus on its Change, or on the panel's notice
   * while New customer's panel is still open over it (the chip is behind the panel then).
   */
  function stay(focus: "change" | "notice" = "change") {
    setAsking(null);
    setChanging(false);
    setText("");
    focusNext.current = focus;
  }

  /** Whether picking another customer asks first: one is set, and something besides it is entered. */
  function wouldAsk(): boolean {
    return getValues("customerId") !== "" && Object.keys(dirtyFields).some((field) => !KEPT.has(field));
  }

  /** New customer's panel goes. */
  function closePanel() {
    setNewName(null);
    setMadeHere(null);
  }

  function switchTo(id: string) {
    setPickedId(id);
    setChanging(false);
    // The notice is about the customer just made; another one takes its place without it.
    setCreated((last) => (last?.id === id ? last : null));
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
    if (wouldAsk()) setAsking(id);
    else {
      setAsking(null);
      switchTo(id);
    }
  }

  /**
   * Made in the panel: their record goes in the cache as `GET /customers/:id` would give it, then they're
   * picked. When picking them asks first, the panel stays open with their notice under the question, so
   * Keep still shows they were made and what became of their invitation.
   */
  function onCreated({ invitation, ...made }: CreatedCustomer) {
    client.setQueryData<Customer>(newOrderKeys.customer(made.id), made);
    setCreated({ id: made.id, name: made.name, invitation });
    if (wouldAsk()) {
      setMadeHere(made.id);
      setAsking(made.id);
      return;
    }
    closePanel();
    focusNext.current = "change";
    pick(made.id);
  }

  /** The panel's Use for this order: picks the customer made there, asking first as any pick does. */
  function takeMade() {
    if (madeHere === null) return;
    if (wouldAsk()) {
      setAsking(madeHere);
      return;
    }
    closePanel();
    focusNext.current = "change";
    switchTo(madeHere);
  }

  /** Send again's answer, wherever the notice is. */
  function onInvitationChange(invitation: SentInvitation) {
    setCreated((last) => (last === null ? null : { ...last, invitation }));
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
        <div className="flex flex-col gap-3">
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
          {/* Made in the panel just now: whether their first person's invitation went, with Send again if not. */}
          {created !== null && created.id === chosen.id && (
            <CreatedNotice customerId={created.id} name={created.name} invitation={created.invitation} onChange={onInvitationChange} />
          )}
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
          {noMatch && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-ink-2">{COPY.customer.noMatch(trimmed)}</p>
              {mayCreate && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 max-w-full rounded-full py-2 text-left whitespace-normal"
                  onClick={() => {
                    setMadeHere(null);
                    setNewName(trimmed);
                  }}
                >
                  <Plus aria-hidden />
                  {/* One name for screen readers, "New customer “Atelier Nord”"; the space joins the two parts. */}
                  <span className="min-w-0 break-words">
                    {COPY.customer.newCustomer}{" "}
                    <span className="font-normal text-ink-2">{COPY.customer.newCustomerTyped(trimmed)}</span>
                  </span>
                </Button>
              )}
            </div>
          )}
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

      {/* Asked over New customer's panel too, when the customer made there would clear the order: both are
          Radix modals, and the one on top traps focus until it's answered. */}
      <ChangeCustomerDialog
        open={candidateActive}
        // Kept while the panel is open: it stays, with focus on the made customer's notice.
        keep={() => stay(madeHere !== null ? "notice" : "change")}
        change={() => {
          if (asking !== null) switchTo(asking);
          setAsking(null);
          closePanel();
          // Their record is loaded, so their chip shows next: focus goes to its Change, then to the product
          // select once the products load. Never left on the page body if they have none.
          focusNext.current = "change";
        }}
      />

      {/* Over the page, which stays mounted beneath it with everything entered. */}
      <NewCustomerPanel
        open={newName !== null}
        name={newName ?? ""}
        created={madeHere !== null && created?.id === madeHere ? created : null}
        noticeRef={panelNotice}
        onInvitationChange={onInvitationChange}
        onClose={() => {
          // After making a customer the order didn't take, the chip of the one it kept is there; else back
          // in the search, with the text still typed.
          focusNext.current = madeHere !== null ? "change" : "search";
          closePanel();
        }}
        onCreated={onCreated}
        onUse={takeMade}
      />
    </div>
  );
}
