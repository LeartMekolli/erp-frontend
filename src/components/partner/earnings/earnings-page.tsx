"use client";

import Link from "next/link";
import { useState } from "react";

import { OwedTotals } from "@/components/earnings/owed-totals";
import { PayoutsTab } from "@/components/earnings/payouts-tab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isApiProblem } from "@/lib/api/problem";
import { partnerRoleAtLeast, usePartnerRole } from "@/lib/auth/permissions";
import { useArrivalNote } from "@/lib/navigation/arrival-note";
import { partnerEarningsKeys, usePartnerOwed, usePartnerPayouts, usePayoutAccount } from "@/lib/partner-earnings/queries";
import { useOwedCatchUp } from "@/lib/payouts/poll";

import { partnerHref } from "../nav";
import { useWorkshop } from "../use-workshop";

import { OwedJobsTab } from "./owed-jobs-tab";
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

type Tab = "payouts" | "jobs";

const TAB_LABEL: Record<Tab, string> = { payouts: "Payouts", jobs: "Jobs" };

/**
 * `/partner-portal/:partnerId/earnings`: what the workshop is owed, its payout account, its payouts and
 * its jobs' pay. Admins and owners only: a member, or anyone erp-api answers 403, reads why instead,
 * and a member's page asks erp-api for nothing. How payout setup ended comes in an arrival note from
 * `/payout-account` (`payout-return.tsx`) and is used up, so a reload doesn't say it again.
 */
export function EarningsPage() {
  const { partnerId, suspended } = useWorkshop();
  const [onboarding, setOnboarding] = useState<Onboarding>(null);
  useArrivalNote(partnerHref(partnerId, "earnings"), (note) => {
    if (note.onboarding) setOnboarding(note.onboarding);
  });
  const role = usePartnerRole(partnerId);
  const allowed = role !== undefined && partnerRoleAtLeast(role, "admin");

  const payouts = usePartnerPayouts(partnerId, allowed);
  const owed = usePartnerOwed(partnerId, { enabled: allowed, poll: payouts.anyPending });
  const account = usePayoutAccount(partnerId, { enabled: allowed, checking: false });
  const refused = [payouts.error, owed.error, account.error].some(isForbidden);

  useOwedCatchUp(payouts.anyPending, partnerEarningsKeys.owed(partnerId));

  // Kept on the page: a reload opens Payouts.
  const [tab, setTab] = useState<Tab>("payouts");
  const choose = (value: string) => setTab(value as Tab);

  return (
    <>
      <h1 className="pt-1 text-title font-semibold">Earnings</h1>
      {(role !== undefined && !allowed) || refused ? (
        <NotForYou partnerId={partnerId} />
      ) : (
        role !== undefined && (
          <>
            <PayoutAccountPanel partnerId={partnerId} role={role} suspended={suspended} onboarding={onboarding} />
            <OwedTotals owed={owed} audience="partner" />
            <Tabs value={tab} onValueChange={choose} activationMode="manual" className="gap-0 rounded-[20px] bg-card">
              <TabsList variant="line" aria-label="Your earnings" className="h-auto! w-full justify-start border-b border-line px-2 pt-2">
                {(["payouts", "jobs"] as const).map((value) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="h-11 flex-none px-3 text-ink-2 group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-ink"
                  >
                    {TAB_LABEL[value]}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="payouts" className="p-3">
                <PayoutsTab payouts={payouts} audience="partner" />
              </TabsContent>
              <TabsContent value="jobs" className="p-3">
                <OwedJobsTab owed={owed} partnerId={partnerId} />
              </TabsContent>
            </Tabs>
          </>
        )
      )}
    </>
  );
}
