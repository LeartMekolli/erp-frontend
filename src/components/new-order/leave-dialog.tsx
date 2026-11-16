"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { COPY } from "./copy";

/** Asks before staff walk away from an order they have started. Closing it any other way is Stay. */
export function LeaveDialog({ open, leave, stay }: { open: boolean; leave: () => void; stay: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && stay()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{COPY.leave.title}</DialogTitle>
          <DialogDescription>{COPY.leave.text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={stay}>
            {COPY.leave.stay}
          </Button>
          <Button type="button" className="min-h-11" onClick={leave}>
            {COPY.leave.leave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
