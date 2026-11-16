"use client";

import { useCan } from "@/lib/auth/permissions";
import { partnersKeys, useStaffPartnerOwed, useStaffPartnerPayouts } from "@/lib/partners/queries";
import { useOwedCatchUp } from "@/lib/payouts/poll";

/**
 * What a workshop is owed and its payouts, read once for the whole partner page: the numbers, Pay,
 * the latest payout line and both tabs share these, so they share one poll. Payouts are read only with
 * `payment.read`; while any loaded payout is on its way both lists re-read, and owed once more after
 * the last one settles.
 */
export function usePartnerMoney(partnerId: string) {
  const canReadPayments = useCan("payment.read");
  const payouts = useStaffPartnerPayouts(partnerId, canReadPayments);
  const owed = useStaffPartnerOwed(partnerId, { poll: payouts.anyPending });
  useOwedCatchUp(payouts.anyPending, partnersKeys.owed(partnerId));
  return { owed, payouts };
}

export type PartnerMoney = ReturnType<typeof usePartnerMoney>;
