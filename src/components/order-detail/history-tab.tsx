"use client";

import { useState } from "react";

import { cn } from "cn";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import type { Group } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { groupByDay } from "@/lib/production/history";
import { useLineMoves, useWorkflowVersion, type MovesFilter } from "@/lib/production/queries";

import { HistoryEntry } from "./history-entry";

const FILTERS: { value: MovesFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fails", label: "Fails and moves back" },
];

function Placeholder() {
  return (
    <div role="status" aria-label="Loading this line's moves" className="flex flex-col gap-3 pt-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="grid grid-cols-[22px_1fr] gap-3">
          <div className="size-[22px] animate-pulse rounded-full bg-panel-soft motion-reduce:animate-none" />
          <div className="h-5 animate-pulse rounded-md bg-panel-soft motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/** What happened on a line, in order: one entry per action, newest first, under its day. */
export function HistoryTab({ group }: { group: Group }) {
  const { timeZone } = useFormat();
  const [filter, setFilter] = useState<MovesFilter>("all");
  const moves = useLineMoves(group.id, filter);
  const version = useWorkflowVersion(group.workflow.id, group.workflow.version);

  let body;
  if (moves.isPending || version.isPending) {
    body = <Placeholder />;
  } else if (!moves.data || !version.data) {
    const failed = moves.data ? version : moves;
    body = <LoadFailure error={failed.error} fallback="This line's moves couldn't be loaded." onRetry={() => void failed.refetch()} />;
  } else if (moves.items.length === 0) {
    body = <p className="py-2 text-sm text-ink-2">{filter === "all" ? "No moves yet." : "No fails or moves back on this line."}</p>;
  } else {
    const steps = version.data.steps;
    body = (
      <>
        {groupByDay(moves.items, moves.dataUpdatedAt, timeZone).map((day) => (
          <div key={day.key}>
            <h3 className="mt-4 mb-0.5 text-caption font-semibold text-ink-2">{day.heading}</h3>
            <ol
              aria-label={`Moves on ${day.heading}`}
              className="relative before:absolute before:top-3.5 before:bottom-3.5 before:left-[10.5px] before:w-px before:bg-line"
            >
              {day.actions.map((action) => (
                <HistoryEntry key={action.id} action={action} steps={steps} />
              ))}
            </ol>
          </div>
        ))}
        <ListEnd list={moves} more="Show earlier moves" auto={false} />
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-col pt-1">
      <div role="group" aria-label="Show" className="inline-flex max-w-full flex-wrap self-start rounded-[10px] bg-ground p-[3px]">
        {FILTERS.map(({ value, label }) => {
          const count = moves.counts?.[value];
          return (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "min-h-9 rounded-lg px-3 text-sm text-ink-2 pointer-coarse:min-h-11",
                filter === value && "bg-card font-medium text-ink shadow-[0_1px_2px_rgb(22_20_28/0.08)]",
              )}
            >
              {label}
              {count !== undefined && (
                <>
                  {" "}
                  <span className="ml-0.5 font-normal text-ink-2 tabular-nums">{count}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {body}
    </div>
  );
}
