"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { useMe } from "@/components/session/session-gate";
import { can } from "@/lib/auth/permissions";
import { PAYOUT_ACCOUNT } from "@/lib/partners/labels";
import { usePartners } from "@/lib/partners/queries";

import { PartnerStatusTag } from "./partner-status-tag";

/** `/partners`: the workshops, each a link to its page. */
export function PartnersPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "partner.read")) notFound();
  return <PartnersList />;
}

function PartnersList() {
  const list = usePartners();

  return (
    <>
      <h1 className="pt-1 text-title font-semibold">Partners</h1>
      <section className="rounded-[20px] bg-card p-3">
        {list.isPending ? (
          <div role="status" aria-label="Loading partners" className="flex flex-col gap-2">
            {[0, 1, 2].map((n) => (
              <div key={n} aria-hidden className="h-16 animate-pulse rounded-xl bg-ground motion-reduce:animate-none md:h-11 md:rounded-lg" />
            ))}
          </div>
        ) : list.isError && list.items.length === 0 ? (
          <LoadFailure error={list.error} fallback="Partners couldn't be loaded." onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-ink-2">No partners yet.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2 md:gap-0 md:divide-y md:divide-line">
              {list.items.map((partner) => (
                <li key={partner.id}>
                  <Link
                    href={`/partners/${partner.id}`}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet md:rounded-lg md:border-0 md:px-3"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:items-center lg:gap-4">
                      <span className="min-w-0 truncate text-sm font-semibold text-ink">{partner.name}</span>
                      <PartnerStatusTag status={partner.status} />
                      <span className="text-sm text-ink-2">{PAYOUT_ACCOUNT[partner.payout_account]}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-2" />
                  </Link>
                </li>
              ))}
            </ul>
            <ListEnd list={list} />
          </>
        )}
      </section>
    </>
  );
}
