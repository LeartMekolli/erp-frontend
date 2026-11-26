"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "cn";
import { useState, type ReactNode } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { LinePieces } from "@/components/production/by-step/line-pieces";
import type { PieceSort, StepCount, StepGroup } from "@/lib/api/schema-types";
import { useStepLines } from "@/lib/production/queries";

import { BoardCard } from "./board-card";
import { PieceHandle, type DropZone } from "./drag";

/** What a card gets from the Board around it: its tick box, its Move to… and whether it's picked. */
export interface CardExtras {
  tick?: ReactNode;
  menu?: ReactNode;
  picked?: boolean;
  /** A drag handle on the card and on each workable piece when it's open. */
  draggable?: boolean;
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
  zone = null,
}: {
  /** While a card is dragged: whether it may land here, as a pass or sent back. */
  zone?: DropZone;
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
  // Only a column the dragged card may land on takes a drop; the rest stay as they are.
  const { setNodeRef, isOver } = useDroppable({ id: step.key, disabled: !zone });

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
                stepKey={step.key}
                today={today}
                selectable={canMove}
                picked={extra.picked}
                tick={extra.tick}
                menu={extra.menu}
                draggable={extra.draggable}
                open={isOpen}
                onToggleOpen={() => setOpen((current) => (current.has(id) ? without(current, id) : new Set(current).add(id)))}
              >
                <LinePieces
                  line={line}
                  stepKey={step.key}
                  selectable={false}
                  selection={null}
                  onTogglePiece={() => {}}
                  handle={
                    extra.draggable
                      ? (piece) => (piece.mayWork && !piece.held ? <PieceHandle stepKey={step.key} line={line} piece={piece} /> : null)
                      : undefined
                  }
                />
              </BoardCard>
            );
          })}
        </ul>
        <ListEnd list={list} auto={false} />
      </>
    );

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-step-column={step.key}
      className={cn(
        "flex w-full shrink-0 snap-center flex-col gap-2 rounded-[18px] bg-card p-2.5 md:w-72 xl:w-auto xl:min-w-60 xl:flex-1",
        zone && "outline-2 outline-offset-2 outline-violet outline-dashed",
        zone && isOver && "bg-lilac/60 outline-solid",
      )}
    >
      {/* Takes focus after a move takes away what had it (`board.tsx`). */}
      <h2 tabIndex={-1} className="flex items-center gap-1.5 rounded-md px-0.5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {step.name}{" "}
        <span className="ml-auto rounded-full bg-line px-2 text-xs font-semibold text-ink-2 tabular-nums">{step.active}</span>
      </h2>
      {zone && <p className="px-0.5 text-caption font-medium text-violet-ink">{zone === "pass" ? "Pass here" : "Send back here"}</p>}
      {held}
      {body}
    </section>
  );
}
