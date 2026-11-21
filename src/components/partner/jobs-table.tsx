"use client";

import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { useRowKeys } from "@/components/orders/use-row-keys";
import type { PartnerJob } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { workspaceToday } from "@/lib/orders/labels";
import { jobTitle, timeLeft } from "@/lib/partner-jobs/labels";
import { usePartnerJobs } from "@/lib/partner-jobs/queries";
import { useNow } from "@/lib/use-now";

import { JobTableRow, TH } from "./job-table-row";
import { usePartnerNotice } from "./notice";
import { jobHref } from "./offer-actions";
import { OfferTableRow } from "./offer-table-row";
import { useWorkshop } from "./use-workshop";

export type JobsTab = "offers" | "progress" | "finished";

const STATUS = { offers: "offered", progress: "accepted", finished: "finished" } as const;

/** How often the time left is worded again. */
const TICK_MS = 15_000;

/** An offer whose deadline has passed: erp-api lets it go, so the table does too. */
const ranOut = (job: PartnerJob, now: number) => job.expires_at !== null && timeLeft(job.expires_at, now).over;

const NO_TOGGLE = () => undefined;

/**
 * One tab of Jobs as a real table, in Orders' style: rows open their job, and J/K/arrows/Enter work
 * from the keyboard. Offers carry their deadline and answers; one that runs out while shown leaves
 * the table and is announced once, each time it's offered.
 */
export function JobsTable({ tab, empty }: { tab: JobsTab; empty: string }) {
  const { partnerId } = useWorkshop();
  const list = usePartnerJobs(partnerId, STATUS[tab]);
  const router = useRouter();
  const { timeZone } = useFormat();
  const now = useNow(TICK_MS);
  const { announce } = usePartnerNotice();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const shown = useRef(new Set<string>());
  const gone = useRef(new Set<string>());
  // The offer holding focus, its dialogs included: React's focus events come up through their portals.
  const focused = useRef<string | null>(null);
  const keys = useRowKeys({ open: (id) => router.push(jobHref(partnerId, id)), toggle: NO_TOGGLE });

  const offers = tab === "offers";
  const rows = offers ? list.items.filter((job) => !ranOut(job, now)) : list.items;
  const over = offers ? list.items.filter((job) => ranOut(job, now)) : [];

  useEffect(() => {
    for (const job of over) {
      if (!shown.current.has(job.id) || gone.current.has(job.id)) continue;
      gone.current.add(job.id);
      // Focus that was in the offer fell to the page with it: bring it to the notice.
      announce(`Time ran out on ${jobTitle(job)}.`, { focus: focused.current === job.id });
      if (focused.current === job.id) focused.current = null;
    }
    for (const job of rows) {
      shown.current.add(job.id);
      gone.current.delete(job.id);
    }
  });

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <p role="status" className="sr-only">
          Loading your jobs…
        </p>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div key={n} aria-hidden className="h-12 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  if (list.isError && list.items.length === 0) {
    return (
      <div className="p-4">
        <LoadFailure
          error={list.error}
          fallback={offers ? "Your offers couldn't be loaded." : "Your jobs couldn't be loaded."}
          onRetry={() => void list.refetch()}
        />
      </div>
    );
  }

  if (rows.length === 0) return <p className="px-4 py-14 text-center text-sm text-ink-2">{empty}</p>;

  const today = workspaceToday(timeZone);
  const activeId = rows.some((job) => job.id === focusedId) ? focusedId : rows[0]!.id;
  const open = (id: string) => router.push(jobHref(partnerId, id));

  return (
    <div>
      <table className="w-full border-collapse" onKeyDown={keys.onKeyDown}>
        <caption className="sr-only">{offers ? "Offers waiting for your answer" : "Your jobs"}</caption>
        <thead>
          <tr>
            <th scope="col" className={`${TH} md:hidden`}>
              <span className="sr-only">Job details</span>
            </th>
            <th scope="col" className={`${TH} hidden md:table-cell`}>
              Job
            </th>
            <th scope="col" className={`${TH} hidden md:table-cell`}>
              Pieces
            </th>
            {offers ? (
              <>
                <th scope="col" className={`${TH} hidden xl:table-cell`}>
                  Your steps
                </th>
                <th scope="col" className={`${TH} hidden md:table-cell`}>
                  Answer by
                </th>
              </>
            ) : (
              <>
                <th scope="col" className={`${TH} hidden md:table-cell`}>
                  Progress
                </th>
                <th scope="col" className={`${TH} hidden md:table-cell`}>
                  Due
                </th>
              </>
            )}
            <th scope="col" className={cn(TH, "hidden text-right md:table-cell")}>
              Pay
            </th>
            {offers && (
              <th scope="col" className={TH}>
                <span className="sr-only">Answer</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((job) =>
            offers ? (
              <OfferTableRow
                key={job.id}
                job={job}
                href={jobHref(partnerId, job.id)}
                now={now}
                focusable={job.id === activeId}
                onFocus={() => setFocusedId(job.id)}
                onOpen={() => open(job.id)}
                onFocusIn={() => (focused.current = job.id)}
                onFocusOut={() => (focused.current = null)}
              />
            ) : (
              <JobTableRow
                key={job.id}
                job={job}
                href={jobHref(partnerId, job.id)}
                today={today}
                inProgress={tab === "progress"}
                focusable={job.id === activeId}
                onFocus={() => setFocusedId(job.id)}
                onOpen={() => open(job.id)}
              />
            ),
          )}
        </tbody>
      </table>
      <div className="px-3">
        <ListEnd list={list} more={offers ? "Show more offers" : "Show more jobs"} auto={!offers} />
      </div>
    </div>
  );
}
