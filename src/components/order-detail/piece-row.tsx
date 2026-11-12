"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";

import { cn } from "cn";

import { Checkbox } from "@/components/ui/checkbox";
import type { WorkOrderListItem } from "@/lib/api/schema-types";

const STATUS: Record<WorkOrderListItem["status"], { word: string; dot: string }> = {
  active: { word: "Active", dot: "bg-violet" },
  finished: { word: "Finished", dot: "bg-ship" },
  scrapped: { word: "Scrapped", dot: "bg-collect" },
  cancelled: { word: "Cancelled", dot: "bg-ink-2" },
};

function lastMoveText(move: NonNullable<WorkOrderListItem["last_move"]>): string {
  const step = move.from_step?.name ?? "a step";
  if (move.kind === "pass") return `Passed ${step}`;
  if (move.kind === "correction") return `Corrected from ${step}`;
  return move.defect ? `Failed at ${step}: ${move.defect.name}` : `Failed at ${step}`;
}

/** One piece in a step's list: its number out of the line's quantity, its status and what last happened to it. */
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
      <Link
        href={`?piece=${piece.id}`}
        scroll={false}
        prefetch={false}
        aria-label={`History of ${piece.label}`}
        className="inline-flex min-h-11 items-center font-medium tabular-nums underline-offset-2 hover:underline"
      >
        {piece.label}
      </Link>
      <span className="inline-flex items-center gap-1.5 text-ink-2">
        <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
        {status.word}
      </span>
      {piece.in_rework && (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <RotateCcw aria-hidden className="size-3.5 shrink-0 text-collect" />
          Being redone
        </span>
      )}
      {piece.last_move && <span className="hidden min-w-0 truncate text-caption text-ink-2 sm:inline">{lastMoveText(piece.last_move)}</span>}
      {selectable && !piece.may_work && <span className="ml-auto text-caption text-ink-2">Needs a skill you don&apos;t have</span>}
    </li>
  );
}
