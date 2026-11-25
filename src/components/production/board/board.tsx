"use client";

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
import type { PieceSort, StepGroup } from "@/lib/api/schema-types";
import { workspaceToday } from "@/lib/orders/labels";
import { boardColumns, type DropMove } from "@/lib/production/board";
import { keepVersion, lineState, toggleLine, type LineSelection } from "@/lib/production/line-selection";
import { fetchLinePieces, useStepLines, useWorkflowCounts, useWorkflows, useWorkflowVersion } from "@/lib/production/queries";

import type { CardExtras } from "./board-column";
import { BoardColumn } from "./board-column";
import { CardMenu } from "./card-menu";
import { OlderLines } from "./older-lines";

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
  // The ticked cards, in one column at a time; ticking in another column starts again.
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

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

  /** The tick box and Move to… a card gets at `stepKey`; none for someone who can't move, or a line erp-api holds. */
  function cardExtras(line: StepGroup, stepKey: string): CardExtras {
    const here = selection?.stepKey === stepKey ? selection : null;
    const checked = lineState(here, line);
    if (!canMove || line.held_reason || !workflowId) return { picked: checked !== false };
    const isBusy = busy.has(line.group.id);
    return {
      picked: checked !== false,
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
            />
          ))}
          {canMove && (
            <section
              aria-label="Scrap"
              className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-1 self-stretch rounded-[18px] border-2 border-dashed border-lost-ink/40 p-4 text-center md:w-28"
            >
              <span className="font-semibold text-lost-ink">Scrap</span>
              <span className="text-caption text-ink-2">Drop to scrap, with a defect</span>
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Board" className="flex flex-col gap-3">
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
      <div className={selection ? "pb-36 md:pb-0" : undefined}>{body}</div>
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
