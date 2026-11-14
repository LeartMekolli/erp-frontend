"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { Button } from "@/components/ui/button";
import { isApiProblem } from "@/lib/api/problem";
import type { PartnerJobDetail } from "@/lib/api/schema-types";
import { doneText, scrappedText, timeLeft } from "@/lib/partner-jobs/labels";
import { usePartnerJob } from "@/lib/partner-jobs/queries";
import { useNow } from "@/lib/use-now";

import { BackToJobs, JobHeader } from "./job-header";
import { JobTabs } from "./job-tabs";
import { partnerHref } from "./nav";
import { OfferActions } from "./offer-actions";
import { PartnerSelectionProvider } from "./partner-pieces";
import { TimeLeft } from "./time-left";
import { useWorkshop } from "./use-workshop";

/** How often the time left is worded again. */
const TICK_MS = 15_000;

/**
 * `/partner-portal/:partnerId/jobs/:groupId`: one job. An offer has its time
 * left with Accept and Decline; an accepted or finished job has its progress,
 * then its pieces, quality, history and comments.
 */
export function JobPage() {
  const { partnerId } = useWorkshop();
  const { groupId } = useParams<{ partnerId: string; groupId: string }>();
  const query = usePartnerJob(partnerId, groupId);
  const jobs = partnerHref(partnerId, "jobs");
  const router = useRouter();
  // Declined and on the way back to Jobs: the declined offer's refetch is a 404, so keep the cached offer meanwhile.
  const [leaving, setLeaving] = useState(false);

  // A job taken away, or a run-out offer refetched, is a 404 even with the last answer still cached.
  // A mistyped link fails erp-api's id check with a 400: it doesn't exist either.
  if (!leaving && isApiProblem(query.error) && (query.error.status === 404 || query.error.status === 400)) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-[20px] bg-card px-6 py-7">
        <h1 className="text-title font-semibold">Job</h1>
        <p className="text-sm text-ink">This job isn&apos;t yours any more, or doesn&apos;t exist.</p>
        <Button asChild variant="link" className="self-start">
          <Link href={jobs}>Back to Jobs</Link>
        </Button>
      </section>
    );
  }

  if (query.isPending) return <Loading />;

  if (!query.data) {
    return (
      <section className="flex flex-col gap-1 rounded-[20px] bg-card px-6 py-5">
        <BackToJobs href={jobs} />
        <h1 className="text-title font-semibold">Job</h1>
        <LoadFailure error={query.error} fallback="This job couldn't be loaded." onRetry={() => void query.refetch()} />
      </section>
    );
  }

  const job = query.data;
  return job.status === "offered" ? (
    <Offer
      job={job}
      jobs={jobs}
      leaving={leaving}
      onRanOut={() => void query.refetch()}
      onDeclined={() => {
        setLeaving(true);
        router.push(jobs);
      }}
    />
  ) : (
    <PartnerSelectionProvider>
      <div className="flex flex-col gap-3.5">
        <JobHeader job={job} jobs={jobs} held>
          <p className="text-sm text-ink-2">{[doneText(job), scrappedText(job)].filter((part) => part !== null).join(" · ")}</p>
        </JobHeader>
        <JobTabs job={job} partnerId={partnerId} />
      </div>
    </PartnerSelectionProvider>
  );
}

/**
 * An offer: the time left and the answers. After Accept the job fetches again
 * (`useAnswerOffer` refreshes every job of the workshop) and shows as accepted;
 * after Decline it goes back to Jobs, where the shell's notice stays. When the
 * time runs out while it's open, the job fetches again on each tick until
 * erp-api has let it go, which is the 404.
 */
function Offer({
  job,
  jobs,
  leaving,
  onRanOut,
  onDeclined,
}: {
  job: PartnerJobDetail;
  jobs: string;
  leaving: boolean;
  onRanOut: () => void;
  onDeclined: () => void;
}) {
  const now = useNow(TICK_MS);
  const over = job.expires_at !== null && timeLeft(job.expires_at, now).over;
  // The tick that last refetched, so each tick asks once.
  const refetched = useRef<number | null>(null);

  // erp-api lets a run-out offer go only when its expiry sweep runs: an offer past
  // its deadline still reads as offered for up to a minute (backend-todos.md), so
  // ask again on every tick rather than once.
  useEffect(() => {
    if (!over || leaving || refetched.current === now) return;
    refetched.current = now;
    onRanOut();
  });

  return (
    <JobHeader job={job} jobs={jobs} held={false}>
      {job.expires_at && <TimeLeft expiresAt={job.expires_at} now={now} />}
      {!over && !leaving && (
        <div className="pt-2">
          <OfferActions
            job={job}
            onAnswered={(answer) => {
              if (answer === "decline") onDeclined();
            }}
          />
        </div>
      )}
    </JobHeader>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading the job" className="flex flex-col gap-3 rounded-[20px] bg-card px-4 py-5 sm:px-6">
      <div aria-hidden className="h-11 w-20 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
      <div aria-hidden className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
      <div aria-hidden className="h-5 w-48 max-w-full animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
    </div>
  );
}
