"use client";

import { cn } from "cn";

import type { WorkOrderListItem } from "@/lib/api/schema-types";

const STATUS: Record<WorkOrderListItem["status"], { word: string; dot: string }> = {
  active: { word: "Active", dot: "bg-violet" },
  finished: { word: "Finished", dot: "bg-ship" },
  scrapped: { word: "Scrapped", dot: "bg-collect" },
  cancelled: { word: "Cancelled", dot: "bg-ink-2" },
};

/** One piece in a step's list: its number out of the line's quantity and its status. */
export function PieceRow({ piece }: { piece: WorkOrderListItem }) {
  const status = STATUS[piece.status];
  return (
    <li className="flex min-h-11 items-center gap-4 border-t border-line px-1 text-sm">
      <span className="font-medium tabular-nums">{piece.label}</span>
      <span className="inline-flex items-center gap-1.5 text-ink-2">
        <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
        {status.word}
      </span>
    </li>
  );
}
