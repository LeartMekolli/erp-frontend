"use client";

import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import { formatMoney } from "@/lib/format/money";
import { useFormat } from "@/lib/format/use-format";
import { PAYOUT_STATUS } from "@/lib/partner-earnings/labels";
import { usePartnerPayouts } from "@/lib/partner-earnings/queries";

import { useWorkshop } from "../use-workshop";

/** How many payouts the tile lists. */
const SHOWN = 3;

/** The newest payouts, with the status in words when one isn't simply paid. Admins and owners only. */
export function PayoutsTile() {
  const { partnerId } = useWorkshop();
  const payouts = usePartnerPayouts(partnerId, true);
  const { date } = useFormat();
  const shown = payouts.items.slice(0, SHOWN);

  return (
    <Tile span={3} title="Latest payouts">
      {payouts.isPending ? (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Loading your payouts…
        </p>
      ) : payouts.isError && shown.length === 0 ? (
        <LoadFailure error={payouts.error} fallback="Couldn't load your payouts." onRetry={() => void payouts.refetch()} />
      ) : shown.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">No payouts yet.</p>
      ) : (
        <ul role="list" className="mt-3 flex flex-col gap-2.5">
          {shown.map((payout) => (
            <li key={payout.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold tabular-nums">{formatMoney(payout.amount, payout.currency)}</span>
                {payout.status === "paid" ? null : (
                  <span className={payout.status === "pending" ? "block text-caption text-ink-2" : "block text-caption font-medium text-late-ink"}>
                    {PAYOUT_STATUS[payout.status]}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-caption text-ink-2">{date(payout.settled_at ?? payout.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
