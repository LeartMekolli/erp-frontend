"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Group, OrderState } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { useStepPieces, type PieceListStatus } from "@/lib/production/queries";
import { nextStepName } from "@/lib/production/selection";

import { LoadFailure } from "./load-failure";
import { MoveBar } from "./move-bar";
import { PieceRow } from "./piece-row";
import { useStepSelection } from "./use-step-selection";

interface Section {
  id: string;
  name: string;
  count: number;
  inRework: number;
  stepKey: string | null;
  status: PieceListStatus;
}

/** Once an order has left the building, or been called off, its pieces stay where they are. */
const NOT_MOVABLE: OrderState[] = ["shipped", "delivered", "cancelled"];

/** erp-api's refusal for an order whose production hasn't started (`orders/payment-hold.ts:7`). */
const WAITING_FOR_PAYMENT = "The order is waiting for payment";

/** The steps holding pieces, in path order, then finished and scrapped. */
function sectionsOf(group: Group): Section[] {
  const steps = group.steps
    .filter((step) => step.count > 0)
    .map((step): Section => ({ id: step.key, name: step.name, count: step.count, inRework: step.in_rework, stepKey: step.key, status: "active" }));
  const off = (["finished", "scrapped"] as const)
    .filter((status) => group.pieces[status] > 0)
    .map((status): Section => ({
      id: `status:${status}`,
      name: status === "finished" ? "Finished" : "Scrapped",
      count: group.pieces[status],
      inRework: 0,
      stepKey: null,
      status,
    }));
  return [...steps, ...off];
}

function PieceSection({
  groupId,
  section,
  open,
  selectable,
  onToggle,
}: {
  groupId: string;
  section: Section;
  open: boolean;
  /** Whether this order and person may pick pieces at all. */
  selectable: boolean;
  onToggle: () => void;
}) {
  const pieces = useStepPieces(groupId, section.stepKey, section.status, open);
  const selection = useStepSelection();
  const { stepKey } = section;
  const picking = selectable && stepKey !== null;
  const pickedHere = selection.groupId === groupId && selection.stepKey === stepKey;
  const workable = pieces.items.filter((piece) => piece.may_work);
  const pickedCount = pickedHere ? workable.filter((piece) => selection.ids.has(piece.id)).length : 0;
  const allPicked = workable.length > 0 && pickedCount === workable.length;

  return (
    <section>
      <div className="flex items-center gap-2">
        {picking && open && pieces.items.length > 0 && (
          <Checkbox
            checked={allPicked ? true : pickedCount > 0 ? "indeterminate" : false}
            disabled={workable.length === 0}
            onCheckedChange={() => (allPicked ? selection.clear() : selection.selectAll(stepKey, pieces.items))}
            aria-label={`Select all at ${section.name}`}
            className="ml-1 after:-inset-3.5"
          />
        )}
        <button
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
      </div>
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
                  onToggle={() => selection.toggle(piece)}
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

/** A line's pieces grouped by where they are; each group loads when it's opened. */
export function PiecesTab({ group, orderState }: { group: Group; orderState: OrderState }) {
  // Only what someone has opened or closed; the first group with pieces starts open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const mayMove = useCan("workflow.move");
  const selection = useStepSelection();
  const sections = sectionsOf(group);
  const firstId = sections[0]?.id;
  const selectable = mayMove && !NOT_MOVABLE.includes(orderState);

  if (sections.length === 0) return <p className="py-2 text-sm text-ink-2">No pieces yet.</p>;

  const mine = selection.groupId === group.id;
  const dropped = mine ? selection.dropped : 0;
  const picked = mine && selection.stepKey !== null && selection.ids.size > 0 ? selection.stepKey : null;
  // The dialogs arrive with the next change to this bar.
  const notYet = () => undefined;

  return (
    <div className="flex flex-col">
      {sections.map((section) => {
        const open = toggled[section.id] ?? section.id === firstId;
        return (
          <PieceSection
            key={section.id}
            groupId={group.id}
            section={section}
            open={open}
            selectable={selectable}
            onToggle={() => setToggled((current) => ({ ...current, [section.id]: !open }))}
          />
        );
      })}
      <p role="status" className="px-1 text-caption font-medium text-ink empty:hidden">
        {dropped > 0 && `${dropped} ${dropped === 1 ? "piece" : "pieces"} moved on and left your selection.`}
      </p>
      {selectable && picked !== null && (
        <MoveBar
          count={selection.ids.size}
          stepName={group.steps.find((step) => step.key === picked)?.name ?? picked}
          nextName={nextStepName(group.steps, picked)}
          disabledReason={orderState === "awaiting_payment" ? WAITING_FOR_PAYMENT : null}
          onPass={notYet}
          onFail={notYet}
          onCorrect={notYet}
        />
      )}
    </div>
  );
}
