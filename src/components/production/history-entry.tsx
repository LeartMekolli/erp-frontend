"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "cn";

import { useFormat } from "@/lib/format/use-format";
import { actionTitle, actorText, isMixed, isNotable, nextText, overrideText, pieceName, pieceResult } from "@/lib/production/history";
import type { MoveEntry, StepRules } from "@/lib/production/shape";

import { MoveFacts, MovePhotos, moveIcon } from "./move-look";
import { useOpenPiece } from "./open-piece";

type LineAction = MoveEntry;

/** Facts on the entry's line, one after another with a dot between. */
function Facts({ children }: { children: ReactNode[] }) {
  const shown = children.filter(Boolean);
  return shown.map((fact, index) => (
    <span key={index}>
      {index > 0 && <span aria-hidden className="text-ink-2">{" · "}</span>}
      {fact}
    </span>
  ));
}

/** What came with a fail or a correction: photo, comment, answers, why it was overridden and who made it. */
function Details({ action, steps }: { action: LineAction; steps: StepRules[] }) {
  return (
    <div role="group" aria-label="What came with it" className="mt-2 flex min-w-0 gap-3.5 rounded-[14px] border border-line px-3.5 py-3">
      <MovePhotos photos={action.photos} at={action.from_step?.name ?? null} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <MoveFacts comment={action.comment} answers={action.answers} override={overrideText(action, steps)} />
        <p className="text-caption text-ink-2">{actorText(action)}</p>
      </div>
    </div>
  );
}

/** One action: a quiet line for a routine move, a boxed one for a fail or a correction. */
export function HistoryEntry({ action, steps }: { action: LineAction; steps: StepRules[] }) {
  const { time } = useFormat();
  const [open, setOpen] = useState(false);
  const openPiece = useOpenPiece().open;
  const listId = useId();
  const { Icon, tone } = moveIcon(action);
  const notable = isNotable(action);
  const mixed = isMixed(action);
  const [only] = action.pieces;
  const count = action.pieces.length;

  const pieces =
    count === 1 && only ? (
      <span className="tabular-nums">{`piece ${pieceName(only)}`}</span>
    ) : (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 underline decoration-lilac-2 underline-offset-[3px] tabular-nums hover:decoration-ink pointer-coarse:min-h-11"
      >
        {`${count} pieces`}
        <ChevronDown aria-hidden className={cn("size-3.5 text-ink-2 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </button>
    );

  return (
    <li className="relative grid grid-cols-[22px_1fr] gap-3 py-1.5">
      <span aria-hidden className={cn("relative z-10 mt-0.5 grid size-[22px] place-items-center rounded-full ring-4 ring-card", tone)}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <p className="min-w-0 break-words">
            <span className={cn(notable && "font-semibold")}>{actionTitle(action)}</span>
            <span aria-hidden className="text-ink-2">{" · "}</span>
            <Facts>{[pieces, nextText(action) && <span className="text-ink-2">{nextText(action)}</span>, !notable && <span className="text-ink-2">{actorText(action)}</span>]}</Facts>
          </p>
          <time dateTime={action.created_at} className="shrink-0 text-caption text-ink-2 tabular-nums max-sm:w-full sm:ml-auto">
            {time(action.created_at)}
          </time>
        </div>
        {open && count > 1 && (
          <ul id={listId} aria-label="Pieces in this move" className="mt-2 flex flex-wrap gap-1.5">
            {action.pieces.map((piece) => (
              <li key={piece.id} className="rounded-lg border border-line px-2 py-0.5 text-caption tabular-nums">
                <button type="button" onClick={() => openPiece(piece.id)} className="cursor-pointer tabular-nums underline-offset-2 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">
                  {pieceName(piece)}
                </button>
                {mixed && ` · ${pieceResult(piece)}`}
              </li>
            ))}
          </ul>
        )}
        {notable && <Details action={action} steps={steps} />}
      </div>
    </li>
  );
}
