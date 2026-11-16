"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useId, useRef, useState } from "react";

import { OwedTotals } from "@/components/earnings/owed-totals";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/error-message";
import type { StaffPartner, StaffPayout } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { formatDayMonth } from "@/lib/format/dates";
import { formatMoney, signOf } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { owedNow } from "@/lib/partner-earnings/labels";
import { PAYOUT_ACCOUNT, STAFF_PAYOUT_STATUS } from "@/lib/partners/labels";
import { payRefusal, usePayPartner } from "@/lib/partners/queries";
import { useOnline } from "@/lib/query/use-online";

import { PayDialog } from "./pay-dialog";
import { SetupLink } from "./setup-link";
import type { PartnerMoney } from "./use-partner-money";

/** Why erp-api didn't pay, by its code (`payment-response.ts:246`); a 409 has already re-read the page. */
function refusalWords(error: unknown): string {
  switch (payRefusal(error)) {
    case "payout_account_not_ready":
      return "This partner's payout account isn't ready any more.";
    case "nothing_due":
      return "There's nothing to pay now. Someone may have just paid them.";
    case "other":
      return "This couldn't be paid. The page has been refreshed.";
    case undefined:
      return errorMessage(error);
  }
}

/** The newest payout, as one line: `Last payout: On its way · €1,240.00 · 15 Nov`, and the provider's words when it failed. */
function LatestPayout({ payout }: { payout: StaffPayout }) {
  const { timeZone } = useFormat();
  const failure = payout.status === "failed" || payout.status === "reversed" ? payout.failure : null;
  return (
    <>
      <p className="tabular-nums">
        {`Last payout: ${STAFF_PAYOUT_STATUS[payout.status]} · ${formatMoney(payout.amount, payout.currency)} · ${formatDayMonth(payout.settled_at ?? payout.created_at, timeZone)}`}
      </p>
      {failure && <p>{`The payment provider said: ${failure}`}</p>}
    </>
  );
}

/**
 * The top of the partner page: what's owed, whether the payout account is ready, Pay and the latest
 * payout. Pay needs `payment.payout` and `payment.read` (without the payouts, nobody could see whether
 * the money arrived), and always asks first. It's disabled with its reason: offline, the account not
 * ready (the account line says why), a payout already on its way, or nothing owed. Every amount is
 * erp-api's; none is added up here.
 */
export function PartnerPay({ partner, money }: { partner: StaffPartner; money: PartnerMoney }) {
  const mayPayOut = useCan("payment.payout");
  const canReadPayments = useCan("payment.read");
  const online = useOnline();
  const pay = usePayPartner(partner.id);
  const [asking, setAsking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const payButton = useRef<HTMLButtonElement>(null);
  // A second click lands before the disabled button renders: only the first one sends.
  const sending = useRef(false);
  const accountId = useId();
  const reasonId = useId();

  const { owed, payouts } = money;
  const totals = owed.totals;
  const firstPage = payouts.data?.pages[0];
  const latest = payouts.items[0];
  const ready = partner.payout_account === "ready";
  // What Pay would send, as erp-api counts it; Pay waits for the payouts too, to know whether one is on its way.
  const amount = totals && owedNow(totals);
  const showPay = mayPayOut && canReadPayments && firstPage !== undefined;

  const pendingFirst = firstPage?.data.some((payout) => payout.status === "pending") ?? false;
  const nothingDue = totals ? signOf(totals.due_total) !== 1 : true;
  // In this order; an account that isn't ready is explained by the account line itself.
  const reason = !online ? "You're offline." : !ready ? null : pendingFirst ? "A payout is on its way." : nothingDue ? "Nothing to pay now." : null;
  const blocked = !online || !ready || reason !== null;
  const describedBy = reason ? reasonId : !ready ? accountId : undefined;

  const confirm = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      await pay.mutateAsync();
      setRefusal(null);
    } catch (error) {
      setRefusal(refusalWords(error));
    } finally {
      sending.current = false;
      setAsking(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <OwedTotals owed={owed} audience="staff" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p id={accountId} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink">
          {ready ? (
            <CircleCheck aria-hidden className="size-4 shrink-0 text-ship" />
          ) : (
            <CircleAlert aria-hidden className="size-4 shrink-0 text-collect" />
          )}
          {PAYOUT_ACCOUNT[partner.payout_account]}
        </p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:max-w-md sm:items-end">
          <SetupLink partnerId={partner.id} account={partner.payout_account} />
          {showPay && amount && (
            <>
              {/* aria-disabled rather than disabled, so focus can come back here from the dialog and the reason is read with it. */}
              <Button
                ref={payButton}
                aria-disabled={blocked}
                aria-describedby={describedBy}
                className="w-full tabular-nums aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-ink sm:w-auto"
                onClick={() => {
                  if (blocked) return;
                  setRefusal(null);
                  setAsking(true);
                }}
              >
                {`Pay ${amount}`}
              </Button>
              {reason && (
                <p id={reasonId} className="text-sm text-ink-2 sm:text-right">
                  {reason}
                </p>
              )}
              <PayDialog
                open={asking}
                onOpenChange={setAsking}
                partnerName={partner.name}
                amount={amount}
                onPay={() => void confirm()}
                pending={pay.isPending}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  payButton.current?.focus();
                }}
              />
            </>
          )}
          {canReadPayments && (
            <div role="status" className="flex flex-col gap-0.5 text-sm text-ink-2 sm:text-right">
              {refusal && <p className="text-ink">{refusal}</p>}
              {latest && <LatestPayout payout={latest} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
