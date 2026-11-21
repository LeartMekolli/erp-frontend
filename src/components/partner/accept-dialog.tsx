"use client";

import { DIALOG_SHEET } from "@/components/production/dialog-classes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PartnerJob } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { answerByText, jobTitle, piecesText, stepsText } from "@/lib/partner-jobs/labels";

export type AcceptJob = Pick<PartnerJob, "id" | "product" | "options" | "quantity" | "due_on" | "cost" | "steps" | "expires_at">;

/**
 * Asks before an offer is taken, with what taking it means: the pieces and due day, the pay, the steps
 * and the deadline. A bottom sheet on a phone. `onCloseAutoFocus` can keep focus from going back to Accept.
 */
export function AcceptDialog({
  job,
  open,
  onOpenChange,
  onAccept,
  pending,
  onCloseAutoFocus,
}: {
  job: AcceptJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  pending: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const format = useFormat();
  const pieces = piecesText(job.quantity);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHEET} onCloseAutoFocus={onCloseAutoFocus}>
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-base font-semibold break-words">{`Take ${jobTitle(job)}?`}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-1 text-sm text-ink-2">
              <p>{job.due_on ? `${pieces}, due ${format.day(job.due_on)}` : pieces}</p>
              <p className="font-medium text-ink tabular-nums">{`${format.money(job.cost, format.currency)} for ${pieces}`}</p>
              {job.steps.length > 0 && <p>{`Your steps: ${stepsText(job.steps)}`}</p>}
              {job.expires_at && <p>{answerByText(job.expires_at, format.timeZone)}</p>}
            </div>
          </DialogDescription>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button disabled={pending} aria-busy={pending} onClick={onAccept}>
            Accept job
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
