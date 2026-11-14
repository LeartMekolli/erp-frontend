"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/order-detail/load-failure";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePartnerJobs } from "@/lib/partner-jobs/queries";

import { JobRow } from "./job-row";
import { partnerHref } from "./nav";
import { OffersBox } from "./offers-box";
import { useWorkshop } from "./use-workshop";

type Tab = "progress" | "finished";

const TAB_LABEL: Record<Tab, string> = { progress: "In progress", finished: "Finished" };

type JobsQuery = ReturnType<typeof usePartnerJobs>;

/**
 * `/partner-portal/:partnerId/jobs`: the offers waiting for an answer, then the
 * accepted jobs under In progress and Finished. The tab is in the address
 * (`?tab=finished`); In progress has no parameter.
 */
export function JobsPage() {
  const { partnerId } = useWorkshop();
  const router = useRouter();
  const tab: Tab = useSearchParams().get("tab") === "finished" ? "finished" : "progress";

  // The same query as the OffersBox (same key): read here only to know whether there are offers.
  const offers = usePartnerJobs(partnerId, "offered");
  const inProgress = usePartnerJobs(partnerId, "accepted", tab === "progress");
  // With no offers and nothing in progress, Finished's first page decides between the two empty messages.
  const nothingOpen =
    tab === "progress" && offers.isSuccess && offers.items.length === 0 && inProgress.isSuccess && inProgress.items.length === 0;
  const finished = usePartnerJobs(partnerId, "finished", tab === "finished" || nothingOpen);

  const choose = (value: string) => {
    const jobs = partnerHref(partnerId, "jobs");
    router.replace(value === "finished" ? `${jobs}?tab=finished` : jobs, { scroll: false });
  };

  return (
    <>
      <h1 className="pt-1 text-title font-semibold">Jobs</h1>

      <OffersBox />

      <Tabs value={tab} onValueChange={choose} activationMode="manual" className="gap-0 rounded-[20px] bg-card">
        <TabsList variant="line" aria-label="Your jobs" className="h-auto! w-full justify-start border-b border-line px-2 pt-2">
          {(["progress", "finished"] as const).map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-11 flex-none px-3 text-ink-2 group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-ink"
            >
              {TAB_LABEL[value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="progress" className="p-3">
          <JobList
            list={inProgress}
            empty={
              nothingOpen && finished.isSuccess && finished.items.length === 0
                ? "No jobs yet. When staff offer you a job, it appears here."
                : "No jobs in progress. New offers appear above."
            }
            // Nothing in progress: wait for the offers, and then for Finished, before choosing the message.
            deciding={inProgress.isSuccess && inProgress.items.length === 0 && (offers.isPending || (nothingOpen && finished.isPending))}
          />
        </TabsContent>
        <TabsContent value="finished" className="p-3">
          <JobList list={finished} empty="No finished jobs yet." />
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * One tab's jobs: placeholder rows while they load (or while it's still
 * unknown which empty message applies), a retry when they can't, the empty
 * message, or the rows with a way to load more.
 */
function JobList({ list, empty, deciding = false }: { list: JobsQuery; empty: string; deciding?: boolean }) {
  if (list.isPending || deciding) {
    return (
      <div role="status" aria-label="Loading your jobs" className="flex flex-col gap-2">
        {[0, 1, 2].map((n) => (
          <div key={n} aria-hidden className="h-16 animate-pulse rounded-xl bg-ground motion-reduce:animate-none md:h-11 md:rounded-lg" />
        ))}
      </div>
    );
  }

  if (list.isError && list.items.length === 0) {
    return <LoadFailure error={list.error} fallback="Your jobs couldn't be loaded." onRetry={() => void list.refetch()} />;
  }

  if (list.items.length === 0) return <p className="px-1 py-6 text-center text-sm text-ink-2">{empty}</p>;

  return (
    <>
      <ul className="flex flex-col gap-2 md:gap-0 md:divide-y md:divide-line">
        {list.items.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </ul>
      <ListEnd list={list} />
    </>
  );
}
