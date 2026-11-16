"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api/error-message";
import { isApiProblem } from "@/lib/api/problem";
import type { PayoutAccountState } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { useFormat } from "@/lib/format/use-format";
import { useStaffPayoutLink } from "@/lib/partners/queries";

type Outcome =
  | { kind: "copied"; until: string }
  | { kind: "by_hand"; url: string; until: string }
  | { kind: "failed"; message: string };

function linkError(error: unknown): string {
  return isApiProblem(error) && error.status === 409 ? "Payments aren't set up for this workspace yet." : errorMessage(error);
}

/**
 * "Copy setup link": a one-time link staff send the partner's owner, to set up or finish the payout
 * account (`POST /partners/{id}/payout-account/link`). Staff with `partner.write`, while the account
 * isn't ready. When the browser refuses the clipboard, the link shows in a field to copy by hand.
 */
export function SetupLink({ partnerId, account }: { partnerId: string; account: PayoutAccountState }) {
  const mayWrite = useCan("partner.write");
  const link = useStaffPayoutLink(partnerId);
  const { time } = useFormat();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const fieldId = useId();

  if (!mayWrite || account === "ready") return null;

  const copy = async () => {
    setOutcome(null);
    let made: { url: string; expires_at: string };
    try {
      made = await link.mutateAsync();
    } catch (error) {
      setOutcome({ kind: "failed", message: linkError(error) });
      return;
    }
    const until = time(made.expires_at);
    try {
      await navigator.clipboard.writeText(made.url);
      setOutcome({ kind: "copied", until });
    } catch {
      setOutcome({ kind: "by_hand", url: made.url, until });
    }
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <Button variant="secondary" className="w-full sm:w-auto" disabled={link.isPending} aria-busy={link.isPending} onClick={() => void copy()}>
        Copy setup link
      </Button>
      <p role="status" className="text-sm text-ink-2 sm:text-right">
        {outcome?.kind === "copied" && `Link copied. It works once, until ${outcome.until}. Send it to the partner's owner.`}
        {outcome?.kind === "failed" && outcome.message}
      </p>
      {outcome?.kind === "by_hand" && (
        <div className="flex w-full flex-col gap-1.5 sm:w-80">
          <Label htmlFor={fieldId}>Setup link</Label>
          <Input
            id={fieldId}
            readOnly
            value={outcome.url}
            aria-describedby={`${fieldId}-hint`}
            onFocus={(event) => event.currentTarget.select()}
          />
          <p id={`${fieldId}-hint`} className="text-caption text-ink-2">{`Copy it by hand. It works once, until ${outcome.until}.`}</p>
        </div>
      )}
    </div>
  );
}
