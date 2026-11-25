"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Freshness } from "@/components/data/freshness";
import { LoadFailure } from "@/components/data/load-failure";
import { useMe } from "@/components/session/session-gate";
import type { PieceSort } from "@/lib/api/schema-types";
import { workspaceToday } from "@/lib/orders/labels";
import { busiestStep, busiestWorkflow } from "@/lib/production/by-step";
import type { LineSelection } from "@/lib/production/line-selection";
import { useStepLines, useWorkflowCounts, useWorkflows } from "@/lib/production/queries";

import { LinesTable } from "./lines-table";
import { MoveFlow } from "./move-flow";
import { StepTabs } from "./step-tabs";
import { ByStepToolbar } from "./toolbar";

/** What By step shows. Product type and step stay null until the counts pick the busiest. React state only: a reload opens the default. */
interface View {
  workflowId: string | null;
  stepKey: string | null;
  q: string | null;
  sort: PieceSort;
  workable: boolean;
}

const DEFAULT_VIEW: View = { workflowId: null, stepKey: null, q: null, sort: "due_on", workable: false };

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
 * By step: one product type's steps, and the order lines waiting at the picked one. It opens on the product
 * type with the most pieces in progress and that type's busiest step.
 */
export function ByStep({ canMove, canUpload }: { canMove: boolean; canUpload: boolean }) {
  const { data: me } = useMe();
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const workflows = useWorkflows();
  const ids = workflows.data?.map((workflow) => workflow.id) ?? [];
  const counts = useWorkflowCounts(ids, view.workable, view.q);

  const countsLoaded = ids.length > 0 && counts.every((query) => query.data !== undefined);
  const workflowId =
    view.workflowId ??
    (countsLoaded ? (busiestWorkflow(ids.map((id, index) => ({ workflowId: id, steps: counts[index]!.data!.steps }))) ?? ids[0]!) : null);
  const index = workflowId === null ? -1 : ids.indexOf(workflowId);
  const steps = counts[index]?.data?.steps ?? null;
  const stepKey = view.stepKey ?? (steps ? busiestStep(steps) : null);
  // The busiest product type and step, once known, are kept: a refetch never moves someone off what they're looking at.
  if (workflowId !== view.workflowId || stepKey !== view.stepKey) setView({ ...view, workflowId, stepKey });

  const filter = { workflowId: workflowId ?? "", stepKey: stepKey ?? "", q: view.q, sort: view.sort, workable: view.workable };
  // The table's query, shared through the cache: Freshness reports on it.
  const lines = useStepLines(filter, workflowId !== null && stepKey !== null);
  // What the last move did, or why the selection changed, announced politely.
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped when the selection goes from under the person: focus then lands on the step, not on the page.
  const [focusSteps, setFocusSteps] = useState(0);
  const stepsRef = useRef<HTMLDivElement>(null);

  // Every picked line has left the listed ones (someone else moved them on): the selection goes with them.
  const left = selection !== null && lines.isSuccess && !lines.isFetching && !lines.items.some((line) => selection.lines.has(line.group.id));
  if (left) {
    setSelection(null);
    setFocusSteps((n) => n + 1);
  }

  useEffect(() => {
    const steps = stepsRef.current;
    if (focusSteps === 0 || !steps) return;
    // The tabs from 768 px; the picker on a phone, where the tabs are hidden and can't take focus.
    const current = steps.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    current?.focus();
    if (!current || document.activeElement !== current) steps.querySelector<HTMLElement>("select")?.focus();
  }, [focusSteps]);

  if (!me) return null;

  if (workflows.isError) {
    return (
      <Panel>
        <div className="px-4 py-3">
          <LoadFailure error={workflows.error} fallback="Production couldn't be loaded." onRetry={() => void workflows.refetch()} />
        </div>
      </Panel>
    );
  }
  if (workflows.data?.length === 0) {
    return (
      <Panel>
        <p className="px-4 py-14 text-center text-sm text-ink-2">No product types yet.</p>
      </Panel>
    );
  }

  const countsFailure = counts.find((query) => query.isError && query.data === undefined);
  const workflow = workflows.data?.find((candidate) => candidate.id === workflowId) ?? null;
  const step = steps?.find((candidate) => candidate.key === stepKey) ?? null;
  const productTypes = (workflows.data ?? []).map((candidate, n) => ({
    id: candidate.id,
    name: candidate.name,
    active: counts[n]?.data?.steps.reduce((sum, s) => sum + s.active, 0) ?? null,
  }));

  function change(next: Partial<View>) {
    setView((current) => ({ ...current, ...next }));
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
  } else if (!step) {
    body = <p className="px-4 py-14 text-center text-sm text-ink-2">{`No pieces in progress for ${workflow.name}.`}</p>;
  } else {
    body = (
      <LinesTable
        filter={filter}
        stepName={step.name}
        selection={selection}
        onSelection={setSelection}
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
              change({ workflowId: id, stepKey: null });
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
        {step && lines.dataUpdatedAt > 0 && <Freshness query={lines} />}
      </div>
      {/* On phones the bar is fixed to the screen's bottom: room for it under the last row. */}
      <div id="production-lines" className={selection ? "pb-36 md:pb-0" : undefined}>
        {body}
      </div>
      {canMove && selection && workflowId && step && (
        <MoveFlow
          mayUpload={canUpload}
          workflowId={workflowId}
          stepKey={step.key}
          selection={selection}
          lines={lines.items}
          onSelection={setSelection}
          onNotice={setNotice}
          onMoved={() => setFocusSteps((n) => n + 1)}
        />
      )}
    </Panel>
  );
}
