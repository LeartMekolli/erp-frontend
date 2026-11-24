import { Suspense } from "react";

import { OpeningEarnings, PayoutReturn } from "@/components/partner/earnings/payout-return";

/**
 * Where the payment provider sends the owner back after setting up payouts (erp-api
 * `payout-accounts.service.ts:73-74`): on to Earnings at its plain address, which says whether setup
 * finished or the link ran out.
 */
export default async function PayoutAccountReturn({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  // Reading the address waits for the browser, so the boundary keeps the rest of the page prerenderable.
  return (
    <Suspense fallback={<OpeningEarnings />}>
      <PayoutReturn partnerId={partnerId} />
    </Suspense>
  );
}
