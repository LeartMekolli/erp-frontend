"use client";

import { ArrowDownToLine } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "cn";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { useFormat } from "@/lib/format/use-format";
import { groupByDay } from "@/lib/production/history";
import type { MoveEntry, StepRules } from "@/lib/production/shape";

import { HistoryEntry } from "./history-entry";

/** Every move, or only fails and corrections that put pieces at a step. */
export type MovesFilter = "all" | "fails";

const FILTERS: { value: MovesFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fails", label: "Fails and moves back" },
];

/** A list that loads page by page, as `useCursorList` gives it. */
type MoveList = ComponentProps<typeof ListEnd>["list"] & {
  items: MoveEntry[];
  data: unknown;
  isPending: boolean;
  error: unknown;
  refetch: () => unknown;
  dataUpdatedAt: number;
};

/** Something that loads, as a query gives it. */
interface Loading<T> {
  data: T | undefined;
  isPending: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** The moment the job came to the partner, placed among the moves by time. */
interface CameMarker {
  marker: true;
  id: string;
  created_at: string;
}

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

function CameToYou({ at }: { at: string }) {
  const { time } = useFormat();
  return (
    <li className="relative grid grid-cols-[22px_1fr] gap-3 py-1.5">
      <span aria-hidden className="relative z-10 mt-0.5 grid size-[22px] place-items-center rounded-full bg-ink text-white ring-4 ring-card">
        <ArrowDownToLine className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <p className="font-semibold">Came to you</p>
        <time dateTime={at} className="shrink-0 text-caption text-ink-2 tabular-nums max-sm:w-full sm:ml-auto">
          {time(at)}
        </time>
      </div>
    </li>
  );
}

/**
 * The moves with the hand-over among them, newest first. The marker shows once the list reaches back past
 * it: before a loaded move that's older, or at the end when nothing older is left to load.
 */
function withMarker(items: MoveEntry[], cameAt: string | null, more: boolean): (MoveEntry | CameMarker)[] {
  if (cameAt === null) return items;
  const marker: CameMarker = { marker: true, id: "came-to-you", created_at: cameAt };
  const came = Date.parse(cameAt);
  const index = items.findIndex((item) => Date.parse(item.created_at) < came);
  if (index === -1) return more ? items : [...items, marker];
  return [...items.slice(0, index), marker, ...items.slice(index)];
}

/** What happened, in order: one entry per action, newest first, under its day. */
export function HistoryTab({
  list,
  counts,
  filter,
  onFilter,
  rules,
  cameAt,
  emptyFails,
}: {
  list: MoveList;
  /** How many moves each filter holds, once known. */
  counts: Partial<Record<MovesFilter, number>> | null;
  filter: MovesFilter;
  onFilter: (filter: MovesFilter) => void;
  /** The steps' rules, to explain a fail that didn't follow its defect's default. */
  rules: Loading<StepRules[]>;
  /** When the job came to the partner; null on staff's line. */
  cameAt: string | null;
  /** What an empty fails filter says. */
  emptyFails: string;
}) {
  const { timeZone } = useFormat();

  let body;
  if (list.isPending || rules.isPending) {
    body = <Placeholder />;
  } else if (!list.data || !rules.data) {
    const failed = list.data ? rules : list;
    body = <LoadFailure error={failed.error} fallback="This line's moves couldn't be loaded." onRetry={() => void failed.refetch()} />;
  } else if (list.items.length === 0) {
    body = <p className="py-2 text-sm text-ink-2">{filter === "all" ? "No moves yet." : emptyFails}</p>;
  } else {
    const steps = rules.data;
    body = (
      <>
        {groupByDay(withMarker(list.items, cameAt, list.hasNextPage), list.dataUpdatedAt, timeZone).map((day) => (
          <div key={day.key}>
            <h3 className="mt-4 mb-0.5 text-caption font-semibold text-ink-2">{day.heading}</h3>
            <ol
              aria-label={`Moves on ${day.heading}`}
              className="relative before:absolute before:top-3.5 before:bottom-3.5 before:left-[10.5px] before:w-px before:bg-line"
            >
              {day.actions.map((item) =>
                "marker" in item ? <CameToYou key={item.id} at={item.created_at} /> : <HistoryEntry key={item.id} action={item} steps={steps} />,
              )}
            </ol>
          </div>
        ))}
        <ListEnd list={list} more="Show earlier moves" auto={false} />
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-col pt-1">
      <div role="group" aria-label="Show" className="inline-flex max-w-full flex-wrap self-start rounded-[10px] bg-ground p-[3px]">
        {FILTERS.map(({ value, label }) => {
          const count = counts?.[value];
          return (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => onFilter(value)}
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
