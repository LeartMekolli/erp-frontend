"use client";

import { cn } from "cn";

/** One part of the strip: a step, or a group such as finished or scrapped. */
export interface Stage {
  key: string;
  name: string;
  count: number;
  inRework: number;
}

function StageItem({ name, count, inRework }: Omit<Stage, "key">) {
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

/** Where the pieces are, stage by stage, in the order given. */
export function StepStrip({ stages }: { stages: Stage[] }) {
  return (
    <ol aria-label="Progress through the steps" className="flex flex-wrap gap-x-1 gap-y-3 pt-2">
      {stages.map((stage) => (
        <StageItem key={stage.key} name={stage.name} count={stage.count} inRework={stage.inRework} />
      ))}
    </ol>
  );
}
