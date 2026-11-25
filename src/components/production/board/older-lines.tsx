"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { PieceSort, StepCount, StepGroup } from "@/lib/api/schema-types";

import { BoardColumn, type CardExtras } from "./board-column";

const pieces = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;

/**
 * The pieces at steps only an older version of the workflow still has: a note above the columns, counted from
 * erp-api's counts, opened as a list of their lines by step.
 */
export function OlderLines({
  steps,
  workflowId,
  sort,
  workable,
  today,
  canMove,
  extras,
}: {
  steps: StepCount[];
  workflowId: string;
  sort: PieceSort;
  workable: boolean;
  today: string;
  canMove: boolean;
  extras?: (line: StepGroup, stepKey: string) => CardExtras;
}) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  const total = steps.reduce((sum, step) => sum + step.active, 0);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-ink outline-none hover:bg-panel-soft focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronDown aria-hidden className={cn("size-4 text-ink-2 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
        {`${pieces(total)} on an older version of this workflow`}
      </button>
      {open && (
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
          {steps.map((step) => (
            <BoardColumn
              key={step.key}
              workflowId={workflowId}
              step={step}
              label={`${step.name} (older version)`}
              sort={sort}
              workable={workable}
              today={today}
              canMove={canMove}
              extras={extras}
            />
          ))}
        </div>
      )}
    </div>
  );
}
