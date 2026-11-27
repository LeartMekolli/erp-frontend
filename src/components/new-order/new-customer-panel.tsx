"use client";

import { XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type Ref } from "react";

import { CreatedNotice } from "@/components/customers/created-notice";
import { CreateCustomerButton, NewCustomerForm, type CreateState } from "@/components/customers/new-customer-form";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { CreatedCustomer, SentInvitation } from "@/lib/api/schema-types";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";

const TEXT = COPY.newCustomer;

/** A customer the panel has just made, with what became of its invitation. */
export interface MadeCustomer {
  id: string;
  name: string;
  invitation: SentInvitation | null;
}

/** The bar at the bottom of the panel: sticks to the bottom of the scroller. */
const BAR =
  "sticky bottom-0 z-10 -mx-3.5 mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-line px-3.5 py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]";

/**
 * The bar under the form: Cancel and Create, or, once closing was asked with something typed, the
 * question in their place with focus on the safe answer. It sits inside the form, so Create submits it,
 * and sticks to the bottom of the scroller. It tells the panel while Create runs, so nothing closes it then.
 */
function PanelFooter({
  state,
  asking,
  onBusyChange,
  onCancel,
  onKeep,
  onDiscard,
}: {
  state: CreateState;
  asking: boolean;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const { creating } = state;
  const keepEditing = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  const questionId = useId();

  useEffect(() => {
    onBusyChange(creating);
  }, [creating, onBusyChange]);

  // Asked: focus on Keep editing. Answered Keep editing (or Escape): back on Cancel, never left on the sheet itself.
  useEffect(() => {
    if (asking) keepEditing.current?.focus();
    else if (wasAsking.current) cancel.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (asking)
    return (
      <div role="alertdialog" aria-labelledby={questionId} className={cn(BAR, "bg-panel-soft")}>
        <p id={questionId} className="mr-auto text-sm font-medium text-ink">
          {TEXT.discard.title}
        </p>
        <Button type="button" variant="secondary" ref={keepEditing} onClick={onKeep}>
          {TEXT.discard.keep}
        </Button>
        <Button type="button" onClick={onDiscard}>
          {TEXT.discard.discard}
        </Button>
      </div>
    );

  return (
    <div className={cn(BAR, "bg-card max-md:[&>button]:flex-1")}>
      <Button type="button" variant="secondary" ref={cancel} disabled={creating} onClick={onCancel}>
        {TEXT.cancel}
      </Button>
      <CreateCustomerButton {...state} />
    </div>
  );
}

/**
 * New customer over New order: the shared form in a sheet from the right, 560 px wide from 768 px and the
 * whole screen below, with the name typed in the search to start with. The order stays mounted beneath it.
 * Cancel, Escape, the overlay and × ask "Discard this customer?" first when the form last said it had
 * something typed; while that's asked, Escape (or the overlay, or ×) goes back to editing.
 * Once `created` is set (the order kept its customer when asked), the form gives way to the customer's
 * notice, with "Open {name}" in a new tab, Use for this order and Close; closing then never asks.
 * Focus is placed by the owner after it closes (Radix would put it back on the button that opened it,
 * which may be gone by then), and on the notice through `noticeRef`.
 */
export function NewCustomerPanel({
  open,
  name,
  created,
  noticeRef,
  onInvitationChange,
  onClose,
  onCreated,
  onUse,
}: {
  open: boolean;
  /** The name the form starts with. */
  name: string;
  /** The customer this panel made, once the order kept the customer it had; null while the form shows. */
  created: MadeCustomer | null;
  noticeRef?: Ref<HTMLDivElement | null>;
  /** Send again's answer, kept by the owner so the notice keeps it wherever it shows next. */
  onInvitationChange: (invitation: SentInvitation) => void;
  /** Closed: without creating, or after creating a customer the order didn't take. */
  onClose: () => void;
  onCreated: (customer: CreatedCustomer) => void;
  /** Use for this order, on the customer made here. */
  onUse: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  function close() {
    setAsking(false);
    onClose();
  }

  function requestClose() {
    if (busy) return;
    // Made already: nothing typed is lost by closing.
    if (created !== null) close();
    // The question is up: Escape, the overlay or × answer it as Keep editing.
    else if (asking) setAsking(false);
    else if (dirty) setAsking(true);
    else close();
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && requestClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="gap-0 bg-ground p-0 shadow-[-24px_0_48px_-24px_rgb(22_20_28/0.3)] data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-none data-[side=right]:md:w-[560px]"
      >
        <div className="flex items-center gap-2 border-b border-line bg-card py-3.5 pr-3 pl-6 max-md:py-1.5 max-md:pr-2 max-md:pl-4">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg font-semibold tracking-[-0.3px] text-ink">{TEXT.title}</SheetTitle>
            <SheetDescription className="text-[13px] text-ink-2">{created ? TEXT.created.description : TEXT.description}</SheetDescription>
          </div>
          {/* Radix's Close asks the sheet to close, which goes through `requestClose`. Once created, the
              footer's Close takes its place, so the panel never has two buttons of one name. */}
          {created === null && (
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="icon" disabled={busy}>
                <XIcon aria-hidden />
                <span className="sr-only">{TEXT.close}</span>
              </Button>
            </SheetClose>
          )}
        </div>
        {/* The scroller is a div: a fieldset doesn't reliably shrink and scroll as a flex item. What's inside
            fills it at least, so its footer sits at the bottom when it's short and sticks there when it scrolls. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [&>*]:min-h-full [&>*]:px-3.5 [&>*]:pt-3.5">
          {created !== null ? (
            <div className="flex flex-col gap-3.5">
              <CreatedNotice
                ref={noticeRef}
                customerId={created.id}
                name={created.name}
                invitation={created.invitation}
                onChange={onInvitationChange}
                openLink
              />
              <div className={cn(BAR, "bg-card max-md:[&>button]:flex-1")}>
                <Button type="button" variant="secondary" onClick={close}>
                  {TEXT.created.close}
                </Button>
                <Button type="button" onClick={onUse}>
                  {TEXT.created.use}
                </Button>
              </div>
            </div>
          ) : (
            <NewCustomerForm
              layout="panel"
              startName={name}
              onDirtyChange={setDirty}
              onCreated={(customer) => {
                setAsking(false);
                setBusy(false);
                onCreated(customer);
              }}
              footer={(state) => (
                <PanelFooter
                  state={state}
                  asking={asking}
                  onBusyChange={setBusy}
                  onCancel={requestClose}
                  onKeep={() => setAsking(false)}
                  onDiscard={close}
                />
              )}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
