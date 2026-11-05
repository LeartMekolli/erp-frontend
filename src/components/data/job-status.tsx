import { cn } from "cn";

import type { JobState } from "@/lib/query/use-polled-job";

const DOT: Record<JobState, string> = {
  pending: "bg-ink-2",
  working: "bg-violet",
  done: "bg-ink",
  failed: "bg-late",
  expired: "bg-late",
};

/** Background work's state as a dot plus a word (spec §6.1), announced as it changes. */
export function JobStatus({
  state,
  labels,
  slow,
  offline,
}: {
  state: JobState;
  labels: Record<JobState, string>;
  slow: boolean;
  offline: boolean;
}) {
  return (
    <div role="status" className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <span aria-hidden="true" data-dot={state} className={cn("size-2 shrink-0 rounded-full", DOT[state])} />
        {labels[state]}
      </p>
      {slow && (
        <p className="text-caption text-ink-2">This is taking longer than usual. You can leave this page; it carries on.</p>
      )}
      {offline && <p className="text-caption text-ink-2">You&apos;re offline. This will update when you&apos;re back.</p>}
    </div>
  );
}
