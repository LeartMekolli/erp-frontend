"use client";

import { CircleX, RotateCcw } from "lucide-react";
import { cn } from "cn";

import { Checkbox } from "@/components/ui/checkbox";
import { HOLD_WORDS } from "@/lib/production/holds";
import type { LastMove, Piece } from "@/lib/production/shape";

import { useOpenPiece } from "./open-piece";

const STATUS: Record<Piece["status"], { word: string; dot: string }> = {
  active: { word: "Active", dot: "bg-violet" },
  finished: { word: "Finished", dot: "bg-ship" },
  scrapped: { word: "Scrapped", dot: "bg-collect" },
  cancelled: { word: "Cancelled", dot: "bg-ink-2" },
};

function lastMoveText(move: LastMove): string {
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
  lostLook = false,
}: {
  piece: Piece;
  /** Whether this list offers picking at all. */
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  /** A scrapped piece in the lost colour with an icon, apart from amber's "being redone". Partner pages only. */
  lostLook?: boolean;
}) {
  const openPiece = useOpenPiece().open;
  const status = STATUS[piece.status];
  const lost = lostLook && piece.status === "scrapped";
  return (
    <li className="flex min-h-11 items-center gap-4 border-t border-line px-1 text-sm">
      {selectable && !piece.held && (
        <Checkbox
          checked={selected}
          disabled={!piece.mayWork}
          onCheckedChange={onToggle}
          aria-label={`Select ${piece.label}`}
          className="after:-inset-3.5"
        />
      )}
      <button
        type="button"
        onClick={() => openPiece(piece.id)}
        aria-label={`History of ${piece.label}`}
        className="inline-flex min-h-11 cursor-pointer items-center font-medium tabular-nums underline-offset-2 hover:underline"
      >
        {piece.label}
      </button>
      {lost ? (
        <span data-look="lost" className="inline-flex items-center gap-1.5 font-medium text-lost-ink">
          <CircleX aria-hidden className="size-3.5 shrink-0" />
          {status.word}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-ink-2">
          <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
          {status.word}
        </span>
      )}
      {piece.inRework && (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <RotateCcw aria-hidden className="size-3.5 shrink-0 text-collect" />
          Being redone
        </span>
      )}
      {piece.lastMove && <span className="hidden min-w-0 truncate text-caption text-ink-2 sm:inline">{lastMoveText(piece.lastMove)}</span>}
      {piece.held ? (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-medium text-ink">
          <span aria-hidden className="size-1.5 rounded-full bg-collect" />
          {HOLD_WORDS[piece.held]}
        </span>
      ) : (
        selectable && !piece.mayWork && <span className="ml-auto text-caption text-ink-2">Needs a skill you don&apos;t have</span>
      )}
    </li>
  );
}
