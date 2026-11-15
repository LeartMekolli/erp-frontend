"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { isApiProblem } from "@/lib/api/problem";
import { partnerRoleAtLeast, usePartnerRole } from "@/lib/auth/permissions";
import { usePartnerOwed, usePartnerPayouts, usePayoutAccount } from "@/lib/partner-earnings/queries";

import { partnerHref } from "../nav";
import { useWorkshop } from "../use-workshop";

import { OwedTotals } from "./owed-totals";
import { PayoutAccountPanel } from "./payout-account-panel";

const isForbidden = (error: unknown) => isApiProblem(error) && error.status === 403;

/** Members don't see earnings; erp-api refuses them. Said quietly: it's not an error. */
function NotForYou({ partnerId }: { partnerId: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card px-6 py-7 sm:px-8">
      <p className="text-sm text-ink-2">Only your workshop&apos;s owner and admins can see earnings.</p>
      <Button asChild variant="link" className="self-start">
        <Link href={partnerHref(partnerId, "jobs")}>Back to Jobs</Link>
      </Button>
    </section>
  );
}

type Onboarding = "done" | "expired" | null;

const onboardingOf = (value: string | null): Onboarding => (value === "done" || value === "expired" ? value : null);

/**
 * `/partner-portal/:partnerId/earnings`: what the workshop is owed, its payout account, its payouts and
 * its jobs' pay. Admins and owners only: a member, or anyone erp-api answers 403, reads why instead,
 * and a member's page asks erp-api for nothing. `?onboarding=` (from the provider, through
 * `/payout-account`) is read once and dropped from the address, so a reload doesn't check again.
 */
export function EarningsPage() {
  const { partnerId, suspended } = useWorkshop();
  const router = useRouter();
  const search = useSearchParams();
  const [onboarding] = useState(() => onboardingOf(search.get("onboarding")));
  const role = usePartnerRole(partnerId);
  const allowed = role !== undefined && partnerRoleAtLeast(role, "admin");

  useEffect(() => {
    if (!search.has("onboarding")) return;
    const rest = new URLSearchParams(search);
    rest.delete("onboarding");
    const query = rest.toString();
    router.replace(`${partnerHref(partnerId, "earnings")}${query ? `?${query}` : ""}`, { scroll: false });
  }, [search, router, partnerId]);

  const payouts = usePartnerPayouts(partnerId, allowed);
  const owed = usePartnerOwed(partnerId, { enabled: allowed, poll: payouts.anyPending });
  const account = usePayoutAccount(partnerId, { enabled: allowed, checking: false });
  const refused = [payouts.error, owed.error, account.error].some(isForbidden);

  return (
    <>
      <h1 className="pt-1 text-title font-semibold">Earnings</h1>
      {(role !== undefined && !allowed) || refused ? (
        <NotForYou partnerId={partnerId} />
      ) : (
        role !== undefined && (
          <>
            <PayoutAccountPanel partnerId={partnerId} role={role} suspended={suspended} onboarding={onboarding} />
            <OwedTotals owed={owed} />
          </>
        )
      )}
    </>
  );
}
