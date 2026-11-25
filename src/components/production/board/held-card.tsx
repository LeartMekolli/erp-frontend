"use client";

import { HerePill, lineName } from "@/components/production/by-step/line-row";
import { Button } from "@/components/ui/button";
import type { HeldMove } from "@/lib/production/use-held-move";

/**
 * A pass waiting its 5 seconds, shown at the top of the step it goes to: the lines it moves, how many pieces
 * (those moving, not all the lines have), "Passing to <step>…" and Undo. Until it's sent the pieces are counted where they were.
 */
export function HeldCard({ move, onUndo }: { move: HeldMove; onUndo: () => void }) {
  return (
    <div data-held className="flex flex-col gap-1.5 rounded-xl border border-dashed border-violet bg-panel-soft px-2.5 py-2 text-sm">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-ink tabular-nums">{move.lines.map((line) => lineName(line)).join(", ")}</span>
        <HerePill count={move.pieces} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium text-ink-2">{`Passing to ${move.toStep.name}…`}</span>
        <Button variant="secondary" className="h-9 px-3 pointer-coarse:h-11" onClick={onUndo}>
          Undo
        </Button>
      </div>
    </div>
  );
}
