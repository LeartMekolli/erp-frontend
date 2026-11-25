"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";

import { passLabel } from "@/components/production/move-bar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { StepGroup } from "@/lib/api/schema-types";
import type { MoveTarget } from "@/lib/production/move-body";
import { pickedLines, pieceIds, type LineSelection } from "@/lib/production/line-selection";
import type { NextStep } from "@/lib/production/shape";

import { lineName } from "./line-row";

/** How many lines the bar names before it sums up the rest. */
const NAMED_LINES = 3;

const count = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/** "all 20 of #1041, 3 of 4 pieces of #1048", listed lines first, then those a search or a new sort hides. */
function pickedText(selection: LineSelection, lines: StepGroup[]): string {
  const parts = pickedLines(selection, lines).flatMap((line) => {
    const picked = selection.lines.get(line.group.id)?.ids.size ?? 0;
    if (picked === 0) return [];
    const name = lineName(line);
    return [picked >= line.count ? `all ${picked} of ${name}` : `${picked} of ${count(line.count, "piece")} of ${name}`];
  });
  const named = parts.slice(0, NAMED_LINES).join(", ");
  const rest = parts.length - NAMED_LINES;
  return rest > 0 ? `${named} and ${count(rest, "more line")}` : named;
}

/** Light on phones, the dark panel of the sketch from 768 px. */
const onDark = "md:border-white/25 md:bg-transparent md:text-white md:hover:bg-white/10";

/**
 * What to do with By step's picked lines: Pass, Move to… (back to a rework step, or scrap) and Clear. Fixed
 * along the bottom of the screen on phones, a dark panel stuck to the bottom of the list from 768 px.
 */
export function SelectionBar({
  selection,
  lines,
  next,
  targets,
  blockedReason,
  busy,
  versions,
  onPass,
  onTarget,
  onKeepVersion,
  onClear,
}: {
  selection: LineSelection;
  /** The listed lines at the step, to name the picked ones. */
  lines: StepGroup[];
  next: NextStep;
  /** Where Move to… can send the pieces; null while the step's rules load. */
  targets: { rework: { key: string; name: string }[]; scrap: boolean } | null;
  /** Why nothing can be moved right now. */
  blockedReason: string | null;
  /**
   * The picked pieces are being read before the dialog opens. Pass and Move to… say they're unavailable
   * (`aria-disabled`) rather than turn disabled, so the button just pressed keeps focus.
   */
  busy: boolean;
  /** The workflow versions the picked lines are on: more than one offers to keep one. */
  versions: number[];
  onPass: () => void;
  onTarget: (target: MoveTarget) => void;
  onKeepVersion: (version: number) => void;
  onClear: () => void;
}) {
  const disabled = blockedReason !== null && !busy;
  // Unavailable but focusable while busy: it looks disabled and ignores presses.
  const waiting = busy ? { "aria-disabled": true, className: "opacity-50" } : null;
  const pieces = pieceIds(selection).length;
  const moveTo = targets ? [...targets.rework.map((step) => ({ kind: "rework" as const, step })), ...(targets.scrap ? [{ kind: "scrap" as const }] : [])] : [];

  return (
    <div
      role="region"
      aria-label="Picked lines"
      data-move-bar
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 rounded-t-[20px] bg-card px-3 pt-3 pb-[max(1.375rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(22_20_28/0.12)] md:sticky md:bottom-4 md:mx-4 md:mb-4 md:flex-row md:items-center md:gap-3.5 md:rounded-2xl md:bg-ink md:py-2 md:pr-2 md:pl-4.5 md:text-white md:shadow-lg"
    >
      <div className="min-w-0 px-1 md:mr-auto md:px-0">
        <p className="text-sm font-semibold tabular-nums">{`${count(selection.lines.size, "line")} · ${count(pieces, "piece")}`}</p>
        <p className="truncate text-caption text-ink-2 md:text-[#c9c6d6]">{pickedText(selection, lines)}</p>
        {blockedReason && (
          <p className="text-caption font-medium text-ink md:text-white" role="status">
            {blockedReason}
          </p>
        )}
      </div>
      {versions.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {versions.map((version) => (
            <Button key={version} type="button" variant="secondary" className={onDark} onClick={() => onKeepVersion(version)}>
              {`Keep version ${version} only`}
            </Button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="md:text-white md:hover:bg-white/10 md:hover:text-white" onClick={onClear}>
          Clear
        </Button>
        {(moveTo.length > 0 || !targets) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              asChild
              // Radix opens the menu only when these weren't prevented: while busy, nothing opens.
              onPointerDown={(event) => {
                if (busy) event.preventDefault();
              }}
              onKeyDown={(event) => {
                if (busy && ["Enter", " ", "ArrowDown"].includes(event.key)) event.preventDefault();
              }}
            >
              <Button
                type="button"
                variant="secondary"
                disabled={disabled || !targets}
                aria-disabled={waiting?.["aria-disabled"]}
                className={cn("flex-1 md:flex-none", onDark, waiting?.className)}
              >
                Move to…
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
              {moveTo.map((target) => (
                <DropdownMenuItem key={target.kind === "scrap" ? "scrap" : target.step.key} className="min-h-11 md:min-h-9" onSelect={() => onTarget(target)}>
                  {target.kind === "scrap" ? "Scrap" : `Send back to ${target.step.name}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          type="button"
          disabled={disabled}
          aria-disabled={waiting?.["aria-disabled"]}
          className={cn("flex-1 md:flex-none md:bg-white md:text-ink md:hover:bg-white/85", waiting?.className)}
          onClick={() => {
            if (!busy) onPass();
          }}
        >
          {passLabel(next)}
        </Button>
      </div>
    </div>
  );
}
