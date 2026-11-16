"use client";

import Link from "next/link";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";

import { LoadFailure } from "@/components/data/load-failure";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isApiProblem } from "@/lib/api/problem";
import { can } from "@/lib/auth/permissions";
import { PAYOUT_ACCOUNT } from "@/lib/partners/labels";
import { usePartner } from "@/lib/partners/queries";

import { PartnerStatusTag } from "./partner-status-tag";

type Tab = "jobs" | "payouts";

const TAB_LABEL: Record<Tab, string> = { jobs: "Jobs", payouts: "Payouts" };

/** `/partners/:id`: one workshop and what it is owed. The tab is in the address (`?tab=payouts`); Jobs has no parameter. */
export function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "partner.read")) notFound();
  return <Partner id={id} canReadPayments={can(me, "payment.read")} />;
}

function BackToPartners() {
  return (
    <Button asChild variant="link" className="self-start">
      <Link href="/partners">Partners</Link>
    </Button>
  );
}

function Partner({ id, canReadPayments }: { id: string; canReadPayments: boolean }) {
  const query = usePartner(id);
  const router = useRouter();
  const search = useSearchParams();

  const tabs: Tab[] = canReadPayments ? ["jobs", "payouts"] : ["jobs"];
  const tab: Tab = canReadPayments && search.get("tab") === "payouts" ? "payouts" : "jobs";
  const choose = (value: string) => {
    router.replace(value === "payouts" ? `/partners/${id}?tab=payouts` : `/partners/${id}`, { scroll: false });
  };

  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading the partner" className="flex flex-col gap-3.5 pt-1">
        <div className="h-16 w-72 animate-pulse rounded-2xl bg-card motion-reduce:animate-none" />
      </div>
    );
  }

  if (!query.data) {
    if (isApiProblem(query.error) && query.error.status === 404) {
      return (
        <section className="flex flex-col items-start gap-3 rounded-[20px] bg-card px-6 py-7">
          <h1 className="text-title font-semibold">This partner doesn&apos;t exist or was removed.</h1>
          <Button asChild variant="link" className="self-start">
            <Link href="/partners">Back to Partners</Link>
          </Button>
        </section>
      );
    }
    return (
      <section className="flex flex-col items-start gap-3 rounded-[20px] bg-card px-6 py-7">
        <BackToPartners />
        <LoadFailure error={query.error} fallback="This partner couldn't be loaded." onRetry={() => void query.refetch()} />
      </section>
    );
  }

  const partner = query.data;
  return (
    <>
      <BackToPartners />
      <header className="flex flex-col gap-1.5">
        <h1 className="text-title font-semibold break-words">{partner.name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <PartnerStatusTag status={partner.status} />
          <span className="text-sm text-ink-2">{PAYOUT_ACCOUNT[partner.payout_account]}</span>
        </div>
      </header>

      <Tabs value={tab} onValueChange={choose} activationMode="manual" className="gap-0 rounded-[20px] bg-card">
        <TabsList variant="line" aria-label="This partner's pay" className="h-auto! w-full justify-start border-b border-line px-2 pt-2">
          {tabs.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-11 flex-none px-3 text-ink-2 group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-ink"
            >
              {TAB_LABEL[value]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="jobs" className="p-3" />
        {canReadPayments && <TabsContent value="payouts" className="p-3" />}
      </Tabs>
    </>
  );
}
