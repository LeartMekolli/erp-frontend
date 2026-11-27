"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { COPY } from "./copy";

/**
 * Asks before staff walk away from something they have started: an order by default, or what `title`
 * and `text` name. Stay is the main (black) button and comes first, since it's the safe choice; closing
 * the dialog any other way is Stay too.
 */
export function LeaveDialog({
  open,
  leave,
  stay,
  title = COPY.leave.title,
  text = COPY.leave.text,
}: {
  open: boolean;
  leave: () => void;
  stay: () => void;
  title?: string;
  text?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && stay()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        {/* Top to bottom on a phone (not the footer's reverse), so Stay is first both on screen and by Tab. */}
        <DialogFooter className="flex-col sm:flex-row">
          <Button type="button" className="min-h-11" onClick={stay}>
            {COPY.leave.stay}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={leave}>
            {COPY.leave.leave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
