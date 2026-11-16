"use client";

import { DIALOG_SHEET } from "@/components/production/dialog-classes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Asks before a workshop is paid: the one place money leaves the workspace, so it always asks.
 * A bottom sheet on a phone. `onCloseAutoFocus` sends focus back to Pay.
 */
export function PayDialog({
  open,
  onOpenChange,
  partnerName,
  amount,
  onPay,
  pending,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerName: string;
  /** What's owed now, formatted. */
  amount: string;
  onPay: () => void;
  pending: boolean;
  onCloseAutoFocus: (event: Event) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHEET} onCloseAutoFocus={onCloseAutoFocus}>
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-base font-semibold break-words">{`Pay ${partnerName} ${amount}?`}</DialogTitle>
          <DialogDescription className="text-sm text-ink-2">
            This sends everything owed now to their payout account. If more became owed since this page loaded, that&apos;s included too.
          </DialogDescription>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} aria-busy={pending} onClick={onPay}>
            Pay
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
