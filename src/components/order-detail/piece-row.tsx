"use client";

import { cn } from "cn";

import { Checkbox } from "@/components/ui/checkbox";
import type { WorkOrderListItem } from "@/lib/api/schema-types";

const STATUS: Record<WorkOrderListItem["status"], { word: string; dot: string }> = {
  active: { word: "Active", dot: "bg-violet" },
  finished: { word: "Finished", dot: "bg-ship" },
  scrapped: { word: "Scrapped", dot: "bg-collect" },
  cancelled: { word: "Cancelled", dot: "bg-ink-2" },
};

/** One piece in a step's list: its number out of the line's quantity and its status. */
export function PieceRow({
  piece,
  selectable,
  selected,
  onToggle,
}: {
  piece: WorkOrderListItem;
  /** Whether this list offers picking at all. */
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const status = STATUS[piece.status];
  return (
    <li className="flex min-h-11 items-center gap-4 border-t border-line px-1 text-sm">
      {selectable && (
        <Checkbox
          checked={selected}
          disabled={!piece.may_work}
          onCheckedChange={onToggle}
          aria-label={`Select ${piece.label}`}
          className="after:-inset-3.5"
        />
      )}
      <span className="font-medium tabular-nums">{piece.label}</span>
      <span className="inline-flex items-center gap-1.5 text-ink-2">
        <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
        {status.word}
      </span>
      {selectable && !piece.may_work && <span className="ml-auto text-caption text-ink-2">Needs a skill you don&apos;t have</span>}
    </li>
  );
}
