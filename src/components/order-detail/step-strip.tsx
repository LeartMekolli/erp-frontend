"use client";

import { cn } from "cn";

import type { Group } from "@/lib/api/schema-types";

function Stage({ name, count, inRework = 0 }: { name: string; count: number; inRework?: number }) {
  return (
    <li className="min-w-20 flex-1">
      <div aria-hidden className={cn("h-2 rounded-full", inRework > 0 ? "bg-collect" : count > 0 ? "bg-violet" : "bg-line")} />
      <p className="mt-1.5 text-caption text-ink-2 break-words">
        <span className={cn("tabular-nums", count > 0 && "font-semibold text-ink")}>{count}</span> {name}
      </p>
      {inRework > 0 && <p className="text-caption text-ink-2">{inRework} being redone</p>}
    </li>
  );
}

/** Where a line's pieces are: every step of its path, then finished and scrapped. */
export function StepStrip({ group }: { group: Group }) {
  return (
    <ol aria-label="Progress through the steps" className="flex flex-wrap gap-x-1 gap-y-3 pt-2">
      {group.steps.map((step) => (
        <Stage key={step.key} name={step.name} count={step.count} inRework={step.in_rework} />
      ))}
      <Stage name="Finished" count={group.pieces.finished} />
      <Stage name="Scrapped" count={group.pieces.scrapped} />
    </ol>
  );
}
