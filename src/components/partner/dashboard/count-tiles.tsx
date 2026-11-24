"use client";

import type { ReactNode } from "react";

import { cn } from "cn";

import { ChangeLine } from "@/components/dashboard/change-line";
import { change } from "@/components/dashboard/headline";
import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import type { PartnerJobCounts, PartnerSummary } from "@/lib/api/schema-types";
import { previousRangeWords } from "@/lib/dashboard/range";
import { usePartnerJobCounts } from "@/lib/partner-dashboard/queries";

import { useWorkshop } from "../use-workshop";

import type { SummaryFailure } from "./summary-failure";

const FIGURE = "mt-1 text-[34px] leading-tight font-semibold tracking-[-0.04em] tabular-nums";

/**
 * Four counts: jobs in progress, late and due in 2 working days right now (they ignore the range), and
 * jobs finished in the range against the range before. Late says so in words, never by colour alone.
 */
export function CountTiles({ summary, words, failure }: { summary: PartnerSummary | undefined; words: string; failure?: SummaryFailure }) {
  const { partnerId } = useWorkshop();
  const counts = usePartnerJobCounts(partnerId);

  const now = (title: string, figure: (data: PartnerJobCounts) => ReactNode) => (
    <Tile span={3} title={title}>
      {counts.data ? (
        figure(counts.data)
      ) : counts.isError ? (
        <LoadFailure error={counts.error} fallback="Couldn't count your jobs." onRetry={() => void counts.refetch()} />
      ) : (
        <p role="status" className="mt-1 text-sm text-ink-2">
          Counting…
        </p>
      )}
    </Tile>
  );

  return (
    <>
      {now("In progress", (data) => (
        <>
          <p className={FIGURE}>{data.accepted}</p>
          <p className="mt-1 text-caption text-ink-2">jobs you&apos;re working on, right now</p>
        </>
      ))}
      {now("Late", (data) => (
        <>
          <p className={cn(FIGURE, data.late > 0 && "text-late-ink")}>{data.late}</p>
          {data.late > 0 ? (
            <p className="mt-1 text-caption font-semibold text-late-ink">▲ Past their due date</p>
          ) : (
            <p className="mt-1 text-caption text-ink-2">nothing past its due date, right now</p>
          )}
        </>
      ))}
      {now("Due in 2 working days", (data) => (
        <>
          <p className={FIGURE}>{data.due_soon}</p>
          <p className="mt-1 text-caption text-ink-2">jobs due by then, right now</p>
        </>
      ))}
      <Tile span={3} title={`Finished · ${words}`}>
        {summary ? (
          <>
            <p className={FIGURE}>{summary.jobs_finished}</p>
            <ChangeLine
              change={change(summary.jobs_finished, summary.previous_jobs_finished, "up", "count")}
              previous={previousRangeWords(summary.range)}
              before={String(summary.previous_jobs_finished)}
              tone="light"
            />
          </>
        ) : failure ? (
          <LoadFailure error={failure.error} fallback="Couldn't count the jobs you finished." onRetry={failure.retry} />
        ) : (
          <p role="status" className="mt-1 text-sm text-ink-2">
            Loading…
          </p>
        )}
      </Tile>
    </>
  );
}
