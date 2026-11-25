"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Freshness } from "@/components/data/freshness";
import { LoadFailure } from "@/components/data/load-failure";
import { useMe } from "@/components/session/session-gate";
import type { PieceSort } from "@/lib/api/schema-types";
import { workspaceToday } from "@/lib/orders/labels";
import { busiestStep } from "@/lib/production/by-step";
import type { LineSelection } from "@/lib/production/line-selection";
import { useStepLines, useWorkflowCounts, useWorkflows } from "@/lib/production/queries";

import { LinesTable, type SelectionUpdate } from "./lines-table";
import { MoveFlow } from "./move-flow";
import { StepTabs } from "./step-tabs";
import { ByStepToolbar } from "./toolbar";

/** What By step shows. The step stays null until the counts pick the busiest. React state only: a reload opens the default. */
interface View {
  /** The product type the step was picked on: another type starts again at its busiest step. */
  workflowId: string | null;
  stepKey: string | null;
  /** The picked step's name as last counted, for when a search leaves it out of the counts. */
  stepName: string | null;
  q: string | null;
  sort: PieceSort;
  workable: boolean;
}

const DEFAULT_VIEW: View = { workflowId: null, stepKey: null, stepName: null, q: null, sort: "due_on", workable: false };

function Panel({ children }: { children: ReactNode }) {
  return <section aria-label="By step" className="flex flex-col rounded-[20px] bg-card">{children}</section>;
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <p role="status" className="sr-only">
        Loading production…
      </p>
      {[0, 1, 2, 3, 4].map((n) => (
        <div key={n} aria-hidden className="h-12 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
      ))}
    </div>
  );
}

/**
 * By step: one product type's steps, and the order lines waiting at the picked one. The product type is the
 * page's (`workflowId`, the busiest until someone picks one); By step opens on that type's busiest step.
 */
export function ByStep({
  canMove,
  canUpload,
  workflowId,
  onWorkflow,
}: {
  canMove: boolean;
  canUpload: boolean;
  workflowId: string | null;
  onWorkflow: (workflowId: string) => void;
}) {
  const { data: me } = useMe();
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const workflows = useWorkflows();
  const ids = workflows.data?.map((workflow) => workflow.id) ?? [];
  const counts = useWorkflowCounts(ids, view.workable, view.q);

  const index = workflowId === null ? -1 : ids.indexOf(workflowId);
  const steps = counts[index]?.data?.steps ?? null;
  const filtered = view.q !== null || view.workable;
  // The step was picked on another product type (the page's changed): start again at this type's busiest.
  const ownStep = view.workflowId === workflowId ? view.stepKey : null;
  // A step only an older workflow version has drops out of the counts once it's empty. With no search or filter
  // that means nothing waits there any more, so the busiest step takes its place.
  const vanished = steps !== null && ownStep !== null && !filtered && !steps.some((s) => s.key === ownStep);
  const stepKey = vanished ? busiestStep(steps) : (ownStep ?? (steps ? busiestStep(steps) : null));
  const step = steps?.find((candidate) => candidate.key === stepKey) ?? null;
  // A search can leave the picked step out of the counts too: it keeps the name it was last counted with.
  const stepName = step?.name ?? (stepKey !== null && stepKey === ownStep ? view.stepName : null);
  // What the last move did, or why the selection changed, announced politely.
  const [notice, setNotice] = useState<string | null>(null);
  // The busiest product type and step, once known, are kept: a refetch never moves someone off what they're looking at.
  if (workflowId !== view.workflowId || stepKey !== view.stepKey || stepName !== view.stepName) {
    if (vanished) {
      setSelection(null);
      setNotice(`Nothing is left at ${view.stepName ?? "that step"}.`);
    }
    setView({ ...view, workflowId, stepKey, stepName });
  }

  const filter = { workflowId: workflowId ?? "", stepKey: stepKey ?? "", q: view.q, sort: view.sort, workable: view.workable };
  // The table's query, shared through the cache: Freshness reports on it.
  const lines = useStepLines(filter, workflowId !== null && stepKey !== null);
  // Bumped when the selection goes from under the person or a move of theirs went through: focus then lands
  // where it belongs rather than on the page.
  const [focusAsked, setFocusAsked] = useState(0);
  const focusDone = useRef(0);
  // After a move of theirs: the row where the first moved line was, once the list without it has loaded.
  const afterMove = useRef<{ index: number; sentAt: number } | null>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);

  // Every picked line has left the step (someone else moved them on): the selection goes with them. Only told
  // from the whole list at the step: a search hides lines without moving them, and a line can sit on a page not loaded.
  const left =
    selection !== null &&
    view.q === null &&
    lines.isSuccess &&
    !lines.isFetching &&
    !lines.hasNextPage &&
    !lines.items.some((line) => selection.lines.has(line.group.id));
  if (left) {
    setSelection(null);
    setNotice("The picked lines have moved on, so nothing is picked now.");
    setFocusAsked((n) => n + 1);
  }

  useEffect(() => {
    if (focusAsked === focusDone.current) return;
    const pending = afterMove.current;
    // After a move, wait for the list fetched since it was sent.
    if (pending && (lines.isFetching || lines.dataUpdatedAt < pending.sentAt)) return;
    focusDone.current = focusAsked;
    afterMove.current = null;
    // Only focus that was lost, with the bar or the row it was in: someone typing or picking elsewhere keeps their place.
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (!lost) return;
    const rows = linesRef.current?.querySelectorAll<HTMLElement>("tr[data-line-row]") ?? [];
    const row = pending && pending.index >= 0 && rows.length > 0 ? rows[Math.min(pending.index, rows.length - 1)] : undefined;
    const control = row?.querySelector<HTMLElement>('[role="checkbox"]:not(:disabled)') ?? row?.querySelector<HTMLElement>("button[aria-expanded]");
    if (control) {
      control.focus();
      return;
    }
    const steps = stepsRef.current;
    if (!steps) return;
    // The tabs from 768 px; the picker on a phone, where the tabs are hidden and can't take focus.
    const current = steps.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    current?.focus();
    if (!current || document.activeElement !== current) steps.querySelector<HTMLElement>("select")?.focus();
  }, [focusAsked, lines.isFetching, lines.dataUpdatedAt]);

  // The page says when the product types can't load or there are none.
  if (!me) return null;

  const countsFailure = counts.find((query) => query.isError && query.data === undefined);
  const workflow = workflows.data?.find((candidate) => candidate.id === workflowId) ?? null;
  const productTypes = (workflows.data ?? []).map((candidate, n) => ({
    id: candidate.id,
    name: candidate.name,
    active: counts[n]?.data?.steps.reduce((sum, s) => sum + s.active, 0) ?? null,
  }));

  // What the person changes clears the last notice: it was about what they saw before.
  function change(next: Partial<View>) {
    setNotice(null);
    setView((current) => ({ ...current, ...next }));
  }

  function pick(update: SelectionUpdate) {
    setNotice(null);
    setSelection(update);
  }

  let body: ReactNode;
  if (countsFailure) {
    body = (
      <div className="px-4 py-3">
        <LoadFailure error={countsFailure.error} fallback="The steps couldn't be loaded." onRetry={() => void countsFailure.refetch()} />
      </div>
    );
  } else if (!workflow || !steps) {
    body = <Skeleton />;
  } else if (stepKey === null || stepName === null) {
    body = <p className="px-4 py-14 text-center text-sm text-ink-2">{`No pieces in progress for ${workflow.name}.`}</p>;
  } else {
    body = (
      <LinesTable
        filter={filter}
        stepName={stepName}
        selection={selection}
        onSelection={pick}
        selectable={canMove}
        today={workspaceToday(me.workspace.timezone)}
      />
    );
  }

  return (
    <Panel>
      <div className="flex flex-col gap-2 border-b border-line px-3 pt-3 md:gap-0">
        <div className="pb-2">
          <ByStepToolbar
            productTypes={productTypes}
            workflowId={workflowId}
            onWorkflow={(id) => {
              setSelection(null);
              change({ stepKey: null });
              onWorkflow(id);
            }}
            q={view.q}
            onSearch={(q) => change({ q })}
            sort={view.sort}
            onSort={(sort) => change({ sort })}
            workable={view.workable}
            onWorkable={(workable) => change({ workable })}
            canMove={canMove}
          />
        </div>
        {steps && (
          <div ref={stepsRef} className="pb-2 md:pb-0">
            <StepTabs
              steps={steps}
              value={step ? stepKey : null}
              onChange={(key) => {
                setSelection(null);
                change({ stepKey: key });
              }}
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pt-2">
        <p role="status" className="text-caption font-medium text-ink">
          {notice}
        </p>
        {stepKey !== null && stepName !== null && lines.dataUpdatedAt > 0 && <Freshness query={lines} />}
      </div>
      {/* The steps' tab panel: every tab filters this one list. On phones the bar is fixed to the screen's
          bottom, so there's room for it under the last row. */}
      <div
        ref={linesRef}
        id="production-lines"
        role="tabpanel"
        aria-label={stepName ? `Lines at ${stepName}` : "Lines"}
        className={selection ? "pb-36 md:pb-0" : undefined}
      >
        {body}
      </div>
      {canMove && selection && workflowId && stepKey !== null && stepName !== null && (
        <MoveFlow
          mayUpload={canUpload}
          workflowId={workflowId}
          stepKey={stepKey}
          selection={selection}
          lines={lines.items}
          onSelection={setSelection}
          onNotice={setNotice}
          onMoved={(at) => {
            afterMove.current = at;
            setFocusAsked((n) => n + 1);
          }}
          onCleared={() => setFocusAsked((n) => n + 1)}
        />
      )}
    </Panel>
  );
}
