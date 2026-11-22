"use client";

import { ChevronDown, CircleCheck } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "cn";

import { LoadFailure } from "@/components/data/load-failure";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MoveBody } from "@/lib/api/schema-types";
import type { MoveKind } from "@/lib/production/move-body";
import type { NextStep, Piece, StepRules } from "@/lib/production/shape";
import type { UploadTarget } from "@/lib/upload/upload";

import { MoveBar } from "./move-bar";
import { MoveDialog } from "./move-dialog";
import { PieceRow } from "./piece-row";
import { useStepSelection } from "./use-step-selection";

/**
 * One group of pieces: those at a step, or those off the path (finished, scrapped), or for a
 * partner those not with it yet or whose part is done.
 */
export interface PieceSection {
  id: string;
  name: string;
  count: number;
  inRework: number;
  /** The step whose pieces can be picked here; null where nothing can be moved. */
  stepKey: string | null;
  status: "active" | "finished" | "scrapped" | "not_yet" | "done";
}

/** A section's pieces, as each area loads them. */
export interface SectionPieces {
  items: Piece[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  hasNextPage: boolean;
  fetchNextPage: () => unknown;
  isFetchingNextPage: boolean;
}

/** Loads a section's pieces once it's open. A hook: it must stay the same function for the life of the tab. */
export type UseSectionPieces = (groupId: string, section: PieceSection, open: boolean) => SectionPieces;

interface PiecesTabProps {
  groupId: string;
  sections: PieceSection[];
  useSectionPieces: UseSectionPieces;
  /** A step's QC rules, or undefined while they load. */
  rules: (stepKey: string) => StepRules | undefined;
  rulesError: boolean;
  /** The steps a correction can put pieces at. */
  path: { key: string; name: string }[];
  next: (stepKey: string) => NextStep;
  /** Whether this person may pick pieces here at all. */
  selectable: boolean;
  mayUpload: boolean;
  uploadTarget: UploadTarget;
  /** Why nothing can be moved right now, such as an order waiting for payment. */
  blockedReason: string | null;
  /** The partner a move at one of its steps counts for. */
  countsFor: string | null;
  onMove: (body: MoveBody) => Promise<void>;
  // The opt-ins below are for the partner's Job page; left out, the tab is as staff know it.
  /** A step's instructions link: at the end of its section's heading, and in its move dialog. */
  stepInstructions?: (stepKey: string) => ReactNode;
  /**
   * After a move, focus and the result stay at the step the pieces left: its heading, with the
   * result as a band under it; once that step is empty, the next step's heading.
   */
  focusAfterMove?: boolean;
  /** Scrapped pieces in the lost colour with an icon, apart from amber's "being redone". */
  lostLook?: boolean;
}

function SectionView({
  groupId,
  section,
  open,
  selectable,
  useSectionPieces,
  onToggle,
  instructions,
  result,
  lostLook,
  toggleRef,
}: {
  groupId: string;
  section: PieceSection;
  open: boolean;
  selectable: boolean;
  useSectionPieces: UseSectionPieces;
  onToggle: () => void;
  instructions?: ReactNode;
  /**
   * What the last move from this step did, shown as a band under its heading. `null` keeps an empty
   * live region there, so the first result is read out; left out, the section has none (staff's pages).
   */
  result?: string | null;
  lostLook: boolean;
  toggleRef: (button: HTMLButtonElement | null) => void;
}) {
  const pieces = useSectionPieces(groupId, section, open);
  const selection = useStepSelection();
  const { stepKey } = section;
  const picking = selectable && stepKey !== null;
  const pickedHere = selection.groupId === groupId && selection.stepKey === stepKey;
  const workable = pieces.items.filter((piece) => piece.mayWork);
  const pickedCount = pickedHere ? workable.filter((piece) => selection.ids.has(piece.id)).length : 0;
  const allPicked = workable.length > 0 && pickedCount === workable.length;

  return (
    <section>
      <div className="flex items-center gap-2">
        {picking && open && pieces.items.length > 0 && (
          <Checkbox
            checked={allPicked ? true : pickedCount > 0 ? "indeterminate" : false}
            disabled={workable.length === 0}
            onCheckedChange={() => (allPicked ? selection.clear() : selection.selectAll(groupId, stepKey, pieces.items))}
            aria-label={`Select all at ${section.name}`}
            className="ml-1 after:-inset-3.5"
          />
        )}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm hover:bg-panel-soft"
        >
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-2 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
          <span className="min-w-0 font-semibold break-words">{section.name}</span>{" "}
          <span className="text-ink-2 tabular-nums">
            {section.count}
            {section.inRework > 0 && ` · ${section.inRework} being redone`}
          </span>
        </button>
        {instructions && <div className="shrink-0">{instructions}</div>}
      </div>
      {result !== undefined && (
        // A live region on the page while its step is, there before any result: a region that appears
        // with its text already in it is often not read out.
        <div role="status">
          {result !== null && (
            <p data-tone="success" className="mb-1 flex items-start gap-2 rounded-lg bg-lilac px-3.5 py-3 text-sm text-violet-ink">
              <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              {result}
            </p>
          )}
        </div>
      )}
      {open && (
        <div className="pb-1">
          {pieces.isPending ? (
            <div role="status" aria-label={`Loading the pieces at ${section.name}`} className="h-11 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />
          ) : pieces.isError && pieces.items.length === 0 ? (
            <LoadFailure error={pieces.error} fallback="These pieces couldn't be loaded." onRetry={() => void pieces.refetch()} />
          ) : pieces.items.length === 0 ? (
            <p className="px-1 py-2 text-sm text-ink-2">Nothing here now.</p>
          ) : (
            <ul>
              {pieces.items.map((piece) => (
                <PieceRow
                  key={piece.id}
                  piece={piece}
                  selectable={picking}
                  selected={pickedHere && selection.ids.has(piece.id)}
                  onToggle={() => selection.toggle(groupId, piece)}
                  lostLook={lostLook}
                />
              ))}
            </ul>
          )}
          {pieces.hasNextPage && (
            <Button variant="link" disabled={pieces.isFetchingNextPage} onClick={() => void pieces.fetchNextPage()}>
              Show more at {section.name}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** The bar for the picked pieces, and the dialog its buttons open. */
function MoveFlow({
  stepKey,
  stepName,
  props,
  onMoved,
}: {
  stepKey: string;
  stepName: string;
  props: PiecesTabProps;
  onMoved: (message: string) => void;
}) {
  const { useSectionPieces } = props;
  const selection = useStepSelection();
  const section: PieceSection = props.sections.find((candidate) => candidate.stepKey === stepKey) ?? {
    id: stepKey,
    name: stepName,
    count: 0,
    inRework: 0,
    stepKey,
    status: "active",
  };
  const loaded = useSectionPieces(props.groupId, section, true);
  const [kind, setKind] = useState<MoveKind | null>(null);
  const rules = props.rules(stepKey);
  const next = props.next(stepKey);
  const pieces = loaded.items.filter((piece) => selection.ids.has(piece.id));

  let disabledReason = props.blockedReason;
  if (disabledReason === null && props.rulesError) disabledReason = "This step's checks couldn't be loaded.";
  else if (disabledReason === null && !rules) disabledReason = "Loading this step's checks…";

  return (
    <>
      <MoveBar
        count={selection.ids.size}
        stepName={stepName}
        next={next}
        disabledReason={disabledReason}
        onPass={() => setKind("pass")}
        onFail={() => setKind("fail")}
        onCorrect={() => setKind("correction")}
      />
      {rules && kind && (
        <MoveDialog
          open
          kind={kind}
          rules={rules}
          path={props.path}
          next={next}
          pieces={pieces}
          mayUpload={props.mayUpload}
          uploadTarget={props.uploadTarget}
          countsFor={rules.partnerStep ? props.countsFor : null}
          onMove={props.onMove}
          onOpenChange={(open) => {
            if (!open) setKind(null);
          }}
          onMoved={onMoved}
          instructions={props.stepInstructions?.(stepKey)}
        />
      )}
    </>
  );
}

/** Pieces grouped by where they are; each group loads when it's opened. */
export function PiecesTab(props: PiecesTabProps) {
  const { groupId, sections, selectable, useSectionPieces } = props;
  // Only what someone has opened or closed; the first group with pieces starts open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // What the last move did, announced politely.
  const [notice, setNotice] = useState<string | null>(null);
  // With `focusAfterMove`: the step the last move left, and where it stood among the sections.
  const [moved, setMoved] = useState<{ stepKey: string; index: number } | null>(null);
  // The move whose focus has been placed, and whether it may still have to go on: once its step
  // empties, the step's heading goes and focus falls with it.
  const placed = useRef<{ stepKey: string; index: number } | null>(null);
  const waiting = useRef(false);
  const toggles = useRef(new Map<string, HTMLButtonElement>());
  const container = useRef<HTMLDivElement>(null);
  const selection = useStepSelection();
  const firstId = sections[0]?.id;

  // Runs after the commit that closed the move dialog, so its focus trap is gone. Later commits only
  // act when the step has emptied and focus fell with its heading.
  useEffect(() => {
    if (!props.focusAfterMove || !moved) return;
    const here = sections.find((section) => section.stepKey === moved.stepKey);
    const focusOn = (section: PieceSection | undefined) => ((section && toggles.current.get(section.id)) ?? container.current)?.focus();
    const next = () => sections[Math.min(moved.index, sections.length - 1)];
    if (placed.current !== moved) {
      placed.current = moved;
      waiting.current = here !== undefined;
      focusOn(here ?? next());
      return;
    }
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (!waiting.current || here || !lost) return;
    waiting.current = false;
    focusOn(next());
  }, [props.focusAfterMove, moved, sections]);

  // Waiting for the step to empty ends at the partner's next click or key: once they've moved on,
  // a step emptied later (by a refetch or someone else's move) never pulls focus back.
  useEffect(() => {
    if (!props.focusAfterMove || !moved) return;
    const stop = () => {
      waiting.current = false;
    };
    document.addEventListener("pointerdown", stop, true);
    document.addEventListener("keydown", stop, true);
    return () => {
      document.removeEventListener("pointerdown", stop, true);
      document.removeEventListener("keydown", stop, true);
    };
  }, [props.focusAfterMove, moved]);

  if (sections.length === 0) return <p className="py-2 text-sm text-ink-2">No pieces yet.</p>;

  const mine = selection.groupId === groupId;
  const dropped = mine ? selection.dropped : 0;
  const picked = mine && selection.stepKey !== null && selection.ids.size > 0 ? selection.stepKey : null;
  // The move's result sits in its step while the step is there; else in the line below the sections.
  const resultAt = props.focusAfterMove && moved && sections.some((section) => section.stepKey === moved.stepKey) ? moved.stepKey : null;

  return (
    <div ref={container} tabIndex={props.focusAfterMove ? -1 : undefined} className={cn("flex flex-col", props.focusAfterMove && "outline-none")}>
      {sections.map((section) => {
        const open = toggled[section.id] ?? section.id === firstId;
        return (
          <SectionView
            key={section.id}
            groupId={groupId}
            section={section}
            open={open}
            selectable={selectable}
            useSectionPieces={useSectionPieces}
            onToggle={() => setToggled((current) => ({ ...current, [section.id]: !open }))}
            instructions={section.stepKey !== null ? props.stepInstructions?.(section.stepKey) : undefined}
            result={props.focusAfterMove ? (resultAt !== null && section.stepKey === resultAt ? notice : null) : undefined}
            lostLook={props.lostLook ?? false}
            toggleRef={(button) => {
              if (button) toggles.current.set(section.id, button);
              else toggles.current.delete(section.id);
            }}
          />
        );
      })}
      <p role="status" className="px-1 text-caption font-medium text-ink empty:hidden">
        {dropped > 0 ? `${dropped} ${dropped === 1 ? "piece" : "pieces"} moved on and left your selection.` : resultAt === null ? notice : null}
      </p>
      {selectable && picked !== null && (
        <MoveFlow
          stepKey={picked}
          stepName={props.path.find((step) => step.key === picked)?.name ?? picked}
          props={props}
          onMoved={(message) => {
            selection.clear();
            setNotice(message);
            setMoved({ stepKey: picked, index: Math.max(0, sections.findIndex((section) => section.stepKey === picked)) });
          }}
        />
      )}
    </div>
  );
}
