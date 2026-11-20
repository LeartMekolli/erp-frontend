"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { COPY } from "./copy";

/**
 * Asks before another customer clears the order started for this one. Keep is the main (black) button,
 * since it's the safe choice; closing the dialog any other way is Keep too. Focus on closing is left to
 * the caller: what had it (the search) is gone by then.
 */
export function ChangeCustomerDialog({ open, keep, change }: { open: boolean; keep: () => void; change: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && keep()}>
      <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{COPY.changeCustomer.title}</DialogTitle>
          <DialogDescription>{COPY.changeCustomer.text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* Keep first, as Stay is in the leave dialog: the safe choice is the first one reached. */}
          <Button type="button" className="min-h-11" onClick={keep}>
            {COPY.changeCustomer.keep}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={change}>
            {COPY.changeCustomer.change}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
