"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Customer } from "@/lib/api/schema-types";
import { useUpdateCustomer } from "@/lib/customers/queries";

import { saveErrors } from "./save-errors";

/**
 * An active customer's More menu holds Disable, which asks first; a disabled customer shows Enable,
 * which doesn't. Both are `PATCH /customers/{id}` with only the status.
 */
export function StatusAction({ customer }: { customer: Customer }) {
  const update = useUpdateCustomer(customer.id);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const control = useRef<HTMLButtonElement>(null);
  const shown = useRef(customer.status);

  // The button pressed is gone once the status changes: focus goes to the one that replaced it, Enable or More.
  useEffect(() => {
    if (shown.current === customer.status) return;
    shown.current = customer.status;
    control.current?.focus();
  }, [customer.status]);

  async function setStatus(status: Customer["status"]) {
    setMessage(null);
    try {
      await update.mutateAsync({ status });
      setAsking(false);
    } catch (error) {
      setMessage(saveErrors(error, () => null).message);
    }
  }

  if (customer.status === "disabled") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button ref={control} variant="secondary" disabled={update.isPending} onClick={() => void setStatus("active")}>
          {update.isPending ? "Enabling…" : "Enable"}
        </Button>
        {message && (
          <p role="alert" className="text-caption text-late-ink">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={control} variant="secondary" size="icon" aria-label="More actions" className="md:size-9 pointer-coarse:size-11">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setAsking(true)}>Disable</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={asking} onOpenChange={(open) => !update.isPending && setAsking(open)}>
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          // Opened from a menu item, not a `DialogTrigger`, so Radix has nothing to give focus back to: More (or Enable, once disabled) takes it.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            control.current?.focus();
          }}
          className="max-w-[calc(100%-1.5rem)] gap-5 p-5 sm:max-w-md max-sm:top-auto max-sm:bottom-3 max-sm:translate-y-0">
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="text-[17px] font-semibold">{`Disable ${customer.name}?`}</DialogTitle>
            <DialogDescription className="text-sm text-ink-2">
              {`${customer.name}'s people won't be able to order or act for it until you enable it again. Its orders and data are kept.`}
            </DialogDescription>
          </div>
          {message && <FormMessage tone="error">{message}</FormMessage>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAsking(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void setStatus("disabled")} disabled={update.isPending} aria-busy={update.isPending || undefined}>
              {update.isPending ? "Disabling…" : "Disable"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
