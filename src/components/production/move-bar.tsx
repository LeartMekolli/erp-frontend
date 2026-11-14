"use client";

import { Button } from "@/components/ui/button";
import type { NextStep } from "@/lib/production/shape";

/** The pass button's words: where the pieces go, Finish at the last step, or Pass when the next step isn't known. */
export function passLabel(next: NextStep): string {
  if (next === "unknown") return "Pass";
  return next ? `Pass to ${next.name}` : "Finish";
}

/**
 * What to do with the picked pieces: a panel stuck to the bottom of the list,
 * full width along the screen's bottom edge on phones.
 */
export function MoveBar({
  count,
  stepName,
  next,
  disabledReason,
  onPass,
  onFail,
  onCorrect,
}: {
  count: number;
  stepName: string;
  next: NextStep;
  /** Why these pieces can't be moved at all right now. */
  disabledReason: string | null;
  onPass: () => void;
  onFail: () => void;
  onCorrect: () => void;
}) {
  const disabled = disabledReason !== null;
  return (
    <div
      role="region"
      aria-label="Selected pieces"
      data-move-bar
      className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center gap-2 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:sticky md:bottom-4 md:mt-2 md:rounded-2xl md:border md:shadow-lg"
    >
      <div className="mr-auto min-w-0 max-md:basis-full">
        <p className="text-sm font-semibold text-ink tabular-nums">{`${count} ${count === 1 ? "piece" : "pieces"} at ${stepName}`}</p>
        {disabledReason && <p className="text-caption text-ink-2">{disabledReason}</p>}
      </div>
      <Button type="button" variant="outline" disabled={disabled} onClick={onCorrect}>
        Correct…
      </Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={onFail}>
        Fail…
      </Button>
      <Button type="button" disabled={disabled} onClick={onPass}>
        {passLabel(next)}
      </Button>
    </div>
  );
}
