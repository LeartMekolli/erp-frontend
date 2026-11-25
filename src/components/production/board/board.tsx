"use client";

import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  type Active,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type ReactNode } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { lineName } from "@/components/production/by-step/line-row";
import { SelectionBar } from "@/components/production/by-step/selection-bar";
import { ByStepToolbar } from "@/components/production/by-step/toolbar";
import { useMoveFlow } from "@/components/production/move-flow/use-move-flow";
import { useMe } from "@/components/session/session-gate";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import type { PieceSort, StepGroup, WorkflowVersion } from "@/lib/api/schema-types";
import { workspaceToday } from "@/lib/orders/labels";
import { boardColumns, dropMove, dropPlan, dropTargets, type DragItem, type DropMove, type DropTargets } from "@/lib/production/board";
import { cancelledWords, DRAG_INSTRUCTIONS, droppedWords, overWords, pickedUpWords } from "@/lib/production/board-words";
import { keepVersion, lineState, pieceIds, toggleLine, type LineSelection } from "@/lib/production/line-selection";
import {
  fetchLinePieces,
  productionKeys,
  sendMoveNow,
  useStepLines,
  useWorkflowCounts,
  useWorkflows,
  useWorkflowVersion,
  workflowVersionQuery,
} from "@/lib/production/queries";
import { staffRules } from "@/lib/production/staff";
import { useHeldMove, type HeldMove } from "@/lib/production/use-held-move";
import { useMediaQuery } from "@/lib/use-media-query";

import { submitErrorText } from "../submit-error";

import type { CardExtras } from "./board-column";
import { BoardColumn } from "./board-column";
import { CardMenu } from "./card-menu";
import { DragPreview, ScrapZone, useBoardSensors, type DropZone } from "./drag";
import { HeldCard } from "./held-card";
import { OlderLines } from "./older-lines";

const count = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;

export interface BoardProps {
  canMove: boolean;
  canUpload: boolean;
  workflowId: string | null;
  onWorkflow: (workflowId: string) => void;
}

function Skeleton() {
  return (
    <div className="flex gap-2.5">
      <p role="status" className="sr-only">
        Loading the board…
      </p>
      {[0, 1, 2].map((n) => (
        <div key={n} aria-hidden className="h-64 w-full animate-pulse rounded-[18px] bg-card motion-reduce:animate-none md:w-72" />
      ))}
    </div>
  );
}

/**
 * The Board: one product type at a time, a column per step of its current version with erp-api's count, a card
 * per order line at that step, then Scrap. Below 768 px one column shows at a time: swipe, or pick the step.
 */
export function Board({ canMove, canUpload, workflowId, onWorkflow }: BoardProps) {
  const { data: me } = useMe();
  const id = useId();
  const client = useQueryClient();
  const [sort, setSort] = useState<PieceSort>("due_on");
  const [workable, setWorkable] = useState(false);
  const [phoneStep, setPhoneStep] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLElement>(null);
  // The ticked cards, in one column at a time; ticking in another column starts again.
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  /** A held pass, sent: its notice, or erp-api's reason when it's refused, and the card stays where it was. */
  async function sendHeld(move: HeldMove, keepalive: boolean) {
    try {
      await sendMoveNow(client, move.body, move.key, { keepalive });
      setNotice(`${count(move.pieces)} passed to ${move.toStep.name}.`);
    } catch (error) {
      setNotice(submitErrorText(error));
    }
  }
  const held = useHeldMove(sendHeld);

  /** Undo: nothing is sent, and focus goes back to the card's Move to… where it still stands. */
  function undoHeld() {
    const move = held.held;
    held.undo();
    if (!move) return;
    const names = move.lines.map((line) => lineName(line)).join(", ");
    setNotice(`Undone. ${names} ${move.lines.length === 1 ? "stays" : "stay"} where ${move.lines.length === 1 ? "it was" : "they were"}.`);
    const first = move.lines[0];
    if (first) {
      boardRef.current
        ?.querySelector<HTMLElement>(`[data-step-column="${move.fromStep}"] button[aria-label="${`Move ${lineName(first)}…`}"]`)
        ?.focus();
    }
  }

  // The ticked column's lines, from the same cache its column reads, to name the ticked cards in the bar.
  const pickedStep = selection?.stepKey ?? "";
  const pickedLines = useStepLines({ workflowId: workflowId ?? "", stepKey: pickedStep, q: null, sort, workable }, selection !== null && workflowId !== null);
  const flow = useMoveFlow({
    workflowId: workflowId ?? "",
    stepKey: pickedStep,
    selection,
    lines: pickedLines.items,
    onSelection: (update) => setSelection(update),
    onNotice: setNotice,
    onMoved: () => {},
    onCleared: () => {},
    mayUpload: canUpload,
    hold: (move) => {
      held.hold(move);
      setNotice(`Passing ${count(move.pieces)} to ${move.toStep.name}. Undo is on the card for 5 seconds.`);
    },
  });

  /** The workable pieces of a line at a step, read from erp-api: ticking or moving a card takes all of them. */
  async function workableAt(line: StepGroup, stepKey: string): Promise<string[]> {
    const pieces = await fetchLinePieces(client, line.group.id, stepKey);
    return pieces.filter((piece) => piece.may_work).map((piece) => piece.id);
  }

  async function tick(line: StepGroup, stepKey: string) {
    const lineId = line.group.id;
    setNotice(null);
    const here = selection?.stepKey === stepKey ? selection : null;
    if (lineState(here, line) === true) {
      setSelection((previous) => toggleLine(previous, stepKey, line, []));
      return;
    }
    setBusy((current) => new Set(current).add(lineId));
    try {
      const ids = await workableAt(line, stepKey);
      setSelection((previous) => toggleLine(previous, stepKey, line, ids));
    } catch {
      setNotice(`The pieces of ${lineName(line)} couldn't be loaded. Try again.`);
    } finally {
      setBusy((current) => new Set([...current].filter((other) => other !== lineId)));
    }
  }

  /** A card's own move (its menu, or a drop): only that card, whatever else is ticked. */
  async function moveCard(line: StepGroup, stepKey: string, move: DropMove) {
    setNotice(null);
    try {
      const lone = toggleLine(null, stepKey, line, await workableAt(line, stepKey));
      if (lone) await flow.start(move.kind, move.kind === "fail" ? move.target : undefined, lone);
    } catch {
      setNotice(`The pieces of ${lineName(line)} couldn't be loaded. Try again.`);
    }
  }

  // Dragging, from 768 px. Below, cards move through Move to…, and a swipe scrolls between steps.
  const wide = useMediaQuery("(min-width: 768px)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const sensors = useBoardSensors();
  const [dragging, setDragging] = useState<{ item: DragItem; targets: DropTargets | null } | null>(null);

  /** Where the dragged card may land, from the rules of its own version (read by its Move to… already). */
  function targetsFor(item: DragItem): DropTargets | null {
    if (!workflowId) return null;
    const steps = client.getQueryData<WorkflowVersion>(productionKeys.version(workflowId, item.line.group.workflow.version))?.steps;
    const step = steps?.find((candidate) => candidate.key === item.stepKey);
    if (!steps || !step) return null;
    const path = steps.map((candidate) => ({ key: candidate.key, name: candidate.name }));
    return dropTargets(staffRules(step, path), path);
  }

  /** How many pieces a drag takes: the piece, every ticked piece when the card is ticked, or the card's own. */
  function piecesOf(item: DragItem): number {
    if (item.pieceId !== undefined) return 1;
    if (selection?.stepKey === item.stepKey && selection.lines.has(item.line.group.id)) return pieceIds(selection).length;
    return item.line.workable;
  }

  const itemOf = (active: Active) => (active.data.current as DragItem | undefined) ?? null;
  const stepName = (over: Over | null) => (over === null ? null : over.id === "scrap" ? "Scrap" : (stepNames.get(String(over.id)) ?? null));
  const moveOver = (item: DragItem, over: Over | null) => {
    const targets = targetsFor(item);
    return over && targets ? dropMove(targets, String(over.id), item.stepKey) : null;
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const item = itemOf(active);
      return item ? pickedUpWords(item.line, piecesOf(item)) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const item = itemOf(active);
      return item ? overWords(stepName(over), moveOver(item, over)) : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const item = itemOf(active);
      return item ? droppedWords(stepName(over), moveOver(item, over)) : undefined;
    },
    onDragCancel: () => cancelledWords(),
  };

  function onDragStart({ active }: DragStartEvent) {
    const item = itemOf(active);
    if (!item) return;
    setNotice(null);
    const targets = targetsFor(item);
    setDragging({ item, targets });
    if (targets || !workflowId) return;
    // Rules not read yet: nothing lights up until they are.
    void client.ensureQueryData(workflowVersionQuery(workflowId, item.line.group.workflow.version)).then(() =>
      setDragging((current) => (current?.item === item ? { item, targets: targetsFor(item) } : current)),
    );
  }

  /** A drop goes through the same move flow as Move to…: held with Undo, or the dialog. */
  function onDragEnd({ active, over }: DragEndEvent) {
    const item = itemOf(active);
    const targets = dragging?.targets ?? (item ? targetsFor(item) : null);
    setDragging(null);
    if (!item) return;
    const plan = dropPlan(item, over ? String(over.id) : null, targets, selection);
    if (!plan) return;
    const target = plan.move.kind === "fail" ? plan.move.target : undefined;
    if (plan.takes === "selection") void flow.start(plan.move.kind, target);
    else if (plan.takes === "line") void moveCard(item.line, item.stepKey, plan.move);
    else {
      const piece: LineSelection = {
        stepKey: item.stepKey,
        lines: new Map([[item.line.group.id, { line: item.line, version: item.line.group.workflow.version, ids: new Set([item.pieceId!]) }]]),
      };
      void flow.start(plan.move.kind, target, piece);
    }
  }

  /** While a card is dragged, whether it may land on this column. */
  function zoneFor(stepKey: string): DropZone {
    const targets = dragging?.targets;
    if (!targets) return null;
    if (targets.pass?.key === stepKey) return "pass";
    return targets.rework.some((step) => step.key === stepKey) ? "back" : null;
  }

  /** The tick box and Move to… a card gets at `stepKey`; none for someone who can't move, or a line erp-api holds. */
  function cardExtras(line: StepGroup, stepKey: string): CardExtras {
    const here = selection?.stepKey === stepKey ? selection : null;
    const checked = lineState(here, line);
    if (!canMove || line.held_reason || !workflowId) return { picked: checked !== false };
    const isBusy = busy.has(line.group.id);
    return {
      picked: checked !== false,
      // Lines at a step only an older version has move through Move to… alone.
      draggable: wide && line.workable > 0 && stepNames.has(stepKey),
      tick: (
        <Checkbox
          checked={checked}
          disabled={isBusy || line.workable === 0}
          aria-busy={isBusy}
          onCheckedChange={() => void tick(line, stepKey)}
          aria-label={`Select ${lineName(line)}`}
          className="pointer-coarse:after:-inset-3.5"
        />
      ),
      menu:
        line.workable > 0 ? <CardMenu line={line} stepKey={stepKey} workflowId={workflowId} onPick={(move) => void moveCard(line, stepKey, move)} /> : undefined,
    };
  }

  const workflows = useWorkflows();
  const ids = workflows.data?.map((workflow) => workflow.id) ?? [];
  const counts = useWorkflowCounts(ids, workable, null);
  const index = workflowId === null ? -1 : ids.indexOf(workflowId);
  const workflow = workflows.data?.[index] ?? null;
  const steps = counts[index]?.data?.steps ?? null;
  const countsFailure = index >= 0 && counts[index]!.isError && !steps ? counts[index]! : null;
  const version = useWorkflowVersion(workflowId ?? "", workflow?.version ?? 0, workflowId !== null && workflow?.version != null);

  if (!me) return null;
  const today = workspaceToday(me.workspace.timezone);

  const productTypes = (workflows.data ?? []).map((candidate, n) => ({
    id: candidate.id,
    name: candidate.name,
    active: counts[n]?.data?.steps.reduce((sum, s) => sum + s.active, 0) ?? null,
  }));

  const current = version.data?.steps.map((step) => ({ key: step.key, name: step.name })) ?? null;
  const layout = steps && current ? boardColumns(steps, current) : null;
  const shown = phoneStep ?? layout?.columns[0]?.key ?? "";
  // The current version's columns by key: where a card may be dragged, and how the drag words name them.
  const stepNames = new Map(layout?.columns.map((step) => [step.key, step.name]) ?? []);

  /** The phone's picker: brings that step's column into view. */
  function showStep(key: string) {
    setPhoneStep(key);
    rowRef.current?.querySelector<HTMLElement>(`[data-step-column="${key}"]`)?.scrollIntoView?.({ inline: "start", block: "nearest" });
  }

  /** A swipe on the phone: the picker follows the column in view. */
  function onScroll() {
    const row = rowRef.current;
    if (!row || !layout || row.clientWidth === 0) return;
    const at = layout.columns[Math.round(row.scrollLeft / row.clientWidth)];
    if (at && at.key !== shown) setPhoneStep(at.key);
  }

  let body: ReactNode;
  if (countsFailure) {
    body = <LoadFailure error={countsFailure.error} fallback="The steps couldn't be loaded." onRetry={() => void countsFailure.refetch()} />;
  } else if (version.isError) {
    body = <LoadFailure error={version.error} fallback="The steps couldn't be loaded." onRetry={() => void version.refetch()} />;
  } else if (!workflowId || !layout) {
    body = <Skeleton />;
  } else if (layout.columns.every((step) => step.active === 0) && layout.older.length === 0) {
    body = <p className="rounded-[20px] bg-card px-4 py-14 text-center text-sm text-ink-2">{`No pieces in progress for ${workflow?.name ?? "this product type"}.`}</p>;
  } else {
    body = (
      <div className="flex flex-col gap-2.5">
        <OlderLines steps={layout.older} workflowId={workflowId} sort={sort} workable={workable} today={today} canMove={canMove} extras={cardExtras} />
        <div className="flex flex-col gap-1 md:hidden">
          <label htmlFor={`${id}-step`} className="text-caption font-medium text-ink-2">
            Step
          </label>
          <NativeSelect id={`${id}-step`} value={shown} onChange={(event) => showStep(event.target.value)}>
            {layout.columns.map((step) => (
              <option key={step.key} value={step.key}>
                {`${step.name} · ${step.active}`}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div ref={rowRef} onScroll={onScroll} className="flex snap-x snap-mandatory items-start gap-2.5 overflow-x-auto pb-2 md:snap-none">
          {layout.columns.map((step) => (
            <BoardColumn
              key={step.key}
              workflowId={workflowId}
              step={step}
              sort={sort}
              workable={workable}
              today={today}
              canMove={canMove}
              extras={cardExtras}
              held={held.held?.toStep.key === step.key ? <HeldCard move={held.held} onUndo={undoHeld} /> : undefined}
              zone={zoneFor(step.key)}
            />
          ))}
          {canMove && <ScrapZone open={dragging?.targets?.scrap ?? false} />}
        </div>
      </div>
    );
  }

  const dragged = dragging?.item ?? null;

  return (
    <section ref={boardRef} aria-label="Board" className="flex flex-col gap-3">
      <div className="rounded-[20px] bg-card px-3 py-3">
        <ByStepToolbar
          productTypes={productTypes}
          workflowId={workflowId}
          onWorkflow={(next) => {
            setPhoneStep(null);
            setSelection(null);
            setNotice(null);
            onWorkflow(next);
          }}
          sort={sort}
          onSort={(next) => {
            setNotice(null);
            setSort(next);
          }}
          workable={workable}
          onWorkable={(next) => {
            setNotice(null);
            setWorkable(next);
          }}
          canMove={canMove}
        />
      </div>
      {/* Always there, so the first notice is read out. */}
      <p role="status" className="min-h-0 px-1 text-caption font-medium text-ink">
        {notice}
      </p>
      {/* On phones the bar is fixed to the screen's bottom: room for it under the columns. */}
      <DndContext
        sensors={sensors}
        // Columns light up once the dragged card's rules are known, so they're measured whenever they change.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{ announcements, screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS } }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className={selection ? "pb-36 md:pb-0" : undefined}>{body}</div>
        <DragOverlay dropAnimation={reduced ? null : undefined}>
          {dragged ? <DragPreview name={lineName(dragged.line)} pieces={piecesOf(dragged)} /> : null}
        </DragOverlay>
      </DndContext>
      {canMove && selection && (
        <SelectionBar
          selection={selection}
          lines={pickedLines.items}
          next={flow.next}
          targets={flow.targets}
          blockedReason={flow.blockedReason}
          busy={flow.busy}
          versions={flow.versions}
          onPass={() => void flow.start("pass")}
          onTarget={(target) => void flow.start("fail", target)}
          onKeepVersion={(kept) => setSelection((current) => (current ? keepVersion(current, kept) : current))}
          onClear={() => setSelection(null)}
        />
      )}
      {flow.dialog}
    </section>
  );
}
