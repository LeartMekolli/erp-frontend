"use client";

import { useState } from "react";

import { Freshness } from "@/components/data/freshness";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormat } from "@/lib/format/use-format";
import { usePartnerJobs } from "@/lib/partner-jobs/queries";

import { JobsTable, type JobsTab } from "./jobs-table";
import { JobsTiles, useOffersWaiting } from "./jobs-tiles";
import { useWorkshop } from "./use-workshop";

const TABS = ["offers", "progress", "finished"] as const satisfies readonly JobsTab[];

const TAB_LABEL: Record<JobsTab, string> = { offers: "Offers", progress: "In progress", finished: "Finished" };

const STATUS = { offers: "offered", progress: "accepted", finished: "finished" } as const;

/**
 * `/partner-portal/:partnerId/jobs`, on the Orders layout: the title and today's date, the tiles,
 * then one list panel whose tabs are Offers, In progress and Finished. The tab is kept on the page,
 * so the address stays plain and a reload opens In progress.
 */
export function JobsPage() {
  const { partnerId } = useWorkshop();
  const [tab, setTab] = useState<JobsTab>("progress");
  const { date } = useFormat();
  const [today] = useState(() => new Date().toISOString());
  const waiting = useOffersWaiting();

  // With no offers and nothing in progress, Finished's first page decides between the two empty messages.
  const inProgress = usePartnerJobs(partnerId, "accepted", tab === "progress");
  const nothingOpen =
    tab === "progress" &&
    waiting.offers.isSuccess &&
    waiting.waiting.length === 0 &&
    !waiting.offers.hasNextPage &&
    inProgress.isSuccess &&
    inProgress.items.length === 0;
  const finished = usePartnerJobs(partnerId, "finished", nothingOpen);
  // The table's query, shared through the cache: Freshness reports on it.
  const shown = usePartnerJobs(partnerId, STATUS[tab]);

  const progressEmpty =
    nothingOpen && finished.isSuccess && finished.items.length === 0
      ? "No jobs yet. When staff offer you a job, it appears under Offers."
      : "No jobs in progress.";
  // Nothing in progress: wait for the offers, and then for Finished, before choosing the message.
  const deciding = tab === "progress" && inProgress.isSuccess && inProgress.items.length === 0 && (waiting.offers.isPending || (nothingOpen && finished.isPending));
  const empty = { offers: "No offers waiting.", progress: progressEmpty, finished: "No finished jobs yet." }[tab];

  return (
    <>
      <div className="flex items-center gap-3 pt-1">
        <h1 className="text-title font-semibold">Jobs</h1>
        <p className="hidden text-sm text-ink-2 sm:block">{date(today)}</p>
      </div>

      <JobsTiles onReviewOffers={() => setTab("offers")} />

      <section id="job-list" aria-label="Job list" className="flex flex-col rounded-[20px] bg-card">
        <div className="border-b border-line px-2 pt-2">
          <Tabs value={tab} onValueChange={(value) => setTab(value as JobsTab)} activationMode="manual" className="min-w-0">
            <TabsList variant="line" aria-label="Jobs by state" className="-mb-px h-auto! w-full justify-start overflow-x-auto [scrollbar-width:none]">
              {TABS.map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  // Every tab filters the one list below rather than showing a panel of its own.
                  aria-controls="job-list"
                  className="h-11 flex-none px-3 text-ink-2 group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-ink"
                >
                  {TAB_LABEL[value]}
                  {value === "offers" && waiting.offers.isSuccess && (
                    <>
                      {" "}
                      <span className="rounded-full bg-line px-1.5 text-xs font-medium text-ink-2 tabular-nums in-data-active:bg-lilac in-data-active:text-violet-ink">
                        {waiting.count}
                      </span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex justify-end px-4 pt-2 empty:hidden">{shown.dataUpdatedAt > 0 && <Freshness query={shown} />}</div>
        {deciding ? (
          <div role="status" aria-label="Loading your jobs" className="flex flex-col gap-2 p-3">
            {[0, 1, 2].map((n) => (
              <div key={n} aria-hidden className="h-12 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <JobsTable key={tab} tab={tab} empty={empty} />
        )}
      </section>
    </>
  );
}
