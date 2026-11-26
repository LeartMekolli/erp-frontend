"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** A dialog from 768 px; below, a sheet over the whole screen. */
const EDIT_SHEET =
  "flex max-h-[calc(100dvh-5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg md:max-w-xl max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none";

/**
 * One section of the customer form in a dialog, with Cancel and Save. Closing with changes (Cancel,
 * Escape, the overlay or the close button) asks "Discard your changes?" first; without changes it closes.
 * Radix gives focus back to what opened it.
 */
export function EditDialog({
  open,
  onOpenChange,
  title,
  description,
  dirty,
  saving,
  message,
  onSave,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  dirty: boolean;
  saving: boolean;
  /** What went wrong that no field shows. */
  message: string | null;
  onSave: () => void;
  children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const discardTitle = useId();

  // The question takes the footer's place; focus goes to the safe answer.
  useEffect(() => {
    if (asking) keepEditing.current?.focus();
  }, [asking]);

  function requestClose() {
    if (saving) return;
    if (dirty) setAsking(true);
    else onOpenChange(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setAsking(false);
    onSave();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <DialogContent className={EDIT_SHEET}>
        <div className="flex flex-col gap-1 border-b border-line px-5 pt-5 pb-3.5 pr-12">
          <DialogTitle className="text-[17px] font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-ink-2">{description}</DialogDescription>
        </div>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <fieldset disabled={saving} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4.5">
            {message && <FormMessage tone="error">{message}</FormMessage>}
            {children}
          </fieldset>
          {asking ? (
            <div role="alertdialog" aria-labelledby={discardTitle} className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-panel-soft px-4 py-3">
              <p id={discardTitle} className="mr-auto text-sm font-medium text-ink">
                Discard your changes?
              </p>
              <Button type="button" variant="secondary" ref={keepEditing} onClick={() => setAsking(false)}>
                Keep editing
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setAsking(false);
                  onOpenChange(false);
                }}
              >
                Discard
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 border-t border-line px-4 py-3 max-md:pb-5 max-md:[&>button]:flex-1">
              <Button type="button" variant="secondary" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} aria-busy={saving || undefined}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
