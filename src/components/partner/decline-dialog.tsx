"use client";

import { DIALOG_SHEET } from "@/components/order-detail/dialog-classes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Asks before an offer is declined, because a decline can't be undone. A bottom
 * sheet on a phone. `onCloseAutoFocus` can keep focus from going back to Decline.
 */
export function DeclineDialog({
  open,
  onOpenChange,
  onDecline,
  pending,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecline: () => void;
  pending: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHEET} onCloseAutoFocus={onCloseAutoFocus}>
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-base font-semibold">Decline this job?</DialogTitle>
          <DialogDescription className="text-sm text-ink-2">Staff will offer it to someone else. You can&apos;t undo this.</DialogDescription>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button disabled={pending} aria-busy={pending} onClick={onDecline}>
            Decline job
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
