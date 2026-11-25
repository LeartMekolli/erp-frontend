"use client";

import { useState, type ReactNode } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { LinePieces } from "@/components/production/by-step/line-pieces";
import type { PieceSort, StepCount, StepGroup } from "@/lib/api/schema-types";
import { useStepLines } from "@/lib/production/queries";

import { BoardCard } from "./board-card";

/** What a card gets from the Board around it: its tick box, its Move to… and whether it's picked. */
export interface CardExtras {
  tick?: ReactNode;
  menu?: ReactNode;
  picked?: boolean;
}

const without = (set: ReadonlySet<string>, id: string) => new Set([...set].filter((other) => other !== id));

/**
 * One step's column: its name and erp-api's count of pieces there, then a card per order line, 50 at a time.
 * A step the counts say is empty asks erp-api for nothing. `label` names the column for screen readers.
 */
export function BoardColumn({
  workflowId,
  step,
  label = step.name,
  sort,
  workable,
  today,
  canMove,
  extras,
  held,
}: {
  /** A pass on its way here, waiting with Undo: shown above the column's own cards. */
  held?: ReactNode;
  workflowId: string;
  step: StepCount;
  label?: string;
  sort: PieceSort;
  workable: boolean;
  today: string;
  canMove: boolean;
  /** What each card gets around it, at this column's step. */
  extras?: (line: StepGroup, stepKey: string) => CardExtras;
}) {
  const filter = { workflowId, stepKey: step.key, q: null, sort, workable };
  const list = useStepLines(filter, step.active > 0);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  let body: ReactNode;
  if (step.active === 0) body = <p className="px-1 py-6 text-center text-caption text-ink-2">Nothing here.</p>;
  else if (list.isPending)
    body = (
      <div className="flex flex-col gap-2">
        <p role="status" className="sr-only">{`Loading the lines at ${step.name}…`}</p>
        {[0, 1, 2].map((n) => (
          <div key={n} aria-hidden className="h-24 animate-pulse rounded-xl bg-ground motion-reduce:animate-none" />
        ))}
      </div>
    );
  else if (list.items.length === 0 && list.isError)
    body = <LoadFailure error={list.error} fallback="These lines couldn't be loaded." onRetry={() => void list.refetch()} />;
  else if (list.items.length === 0) body = <p className="px-1 py-6 text-center text-caption text-ink-2">Nothing here.</p>;
  else
    body = (
      <>
        <ul aria-label={`Lines at ${step.name}`} className="flex flex-col gap-2">
          {list.items.map((line) => {
            const id = line.group.id;
            const isOpen = open.has(id);
            const extra = extras?.(line, step.key) ?? {};
            return (
              <BoardCard
                key={id}
                line={line}
                today={today}
                selectable={canMove}
                picked={extra.picked}
                tick={extra.tick}
                menu={extra.menu}
                open={isOpen}
                onToggleOpen={() => setOpen((current) => (current.has(id) ? without(current, id) : new Set(current).add(id)))}
              >
                <LinePieces line={line} stepKey={step.key} selectable={false} selection={null} onTogglePiece={() => {}} />
              </BoardCard>
            );
          })}
        </ul>
        <ListEnd list={list} auto={false} />
      </>
    );

  return (
    <section aria-label={label} data-step-column={step.key} className="flex w-full shrink-0 snap-center flex-col gap-2 rounded-[18px] bg-card p-2.5 md:w-72 xl:w-auto xl:min-w-60 xl:flex-1">
      <h2 className="flex items-center gap-1.5 px-0.5 text-sm font-semibold">
        {step.name}{" "}
        <span className="ml-auto rounded-full bg-line px-2 text-xs font-semibold text-ink-2 tabular-nums">{step.active}</span>
      </h2>
      {held}
      {body}
    </section>
  );
}
