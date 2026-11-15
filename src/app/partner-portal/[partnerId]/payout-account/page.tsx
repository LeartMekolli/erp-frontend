import { redirect } from "next/navigation";

/**
 * Where the payment provider sends the owner back after setting up payouts (erp-api
 * `payout-accounts.service.ts:73-74`): on to Earnings, saying whether setup finished or the link ran out.
 */
export default async function PayoutAccountReturn({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { partnerId } = await params;
  const { onboarding } = await searchParams;
  const earnings = `/partner-portal/${partnerId}/earnings`;
  redirect(onboarding === "done" || onboarding === "expired" ? `${earnings}?onboarding=${onboarding}` : earnings);
}
