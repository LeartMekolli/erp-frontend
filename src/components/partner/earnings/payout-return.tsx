"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { leaveArrivalNote } from "@/lib/navigation/arrival-note";

import { partnerHref } from "../nav";

/** Says the page is moving on, while it does. */
export function OpeningEarnings() {
  return (
    <p role="status" className="pt-1 text-sm text-ink-2">
      Opening Earnings…
    </p>
  );
}

/**
 * The client half of `/partner-portal/:partnerId/payout-account`, where the payment provider sends the owner
 * back with `?onboarding=done` or `expired` (erp-api `payout-accounts.service.ts:73-74`). The provider adds
 * that part, so AMI can't avoid receiving it: this is the one place allowed to read it (CLAUDE.md § Addresses).
 * It hands the answer to Earnings in an arrival note and opens Earnings at its plain address.
 */
export function PayoutReturn({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const answer = useSearchParams().get("onboarding");

  useEffect(() => {
    const earnings = partnerHref(partnerId, "earnings");
    if (answer === "done" || answer === "expired") leaveArrivalNote(earnings, { onboarding: answer });
    router.replace(earnings);
  }, [answer, partnerId, router]);

  return <OpeningEarnings />;
}
