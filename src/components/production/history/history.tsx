"use client";

import { useEffect, useState } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { Button } from "@/components/ui/button";
import type { MoveListQueryParams } from "@/lib/api/schema-types";
import { dayKey } from "@/lib/format/dates";
import { useFormat } from "@/lib/format/use-format";
import { groupByDay } from "@/lib/production/history";
import { DEFAULT_HISTORY, moveListQuery, setFilterCount } from "@/lib/production/move-list";
import { useDefects, useMoveActors, useMoveList, useWorkflowVersion, useWorkflows } from "@/lib/production/queries";
import { useMediaQuery } from "@/lib/use-media-query";

import { PhoneFilters, WideFilters, type FilterOptions, type MoveFilters } from "./history-filters";
import { MoveRow } from "./move-row";

/** "10 min ago" moves on once a minute. */
const TICK_MS = 60_000;

function Placeholder() {
  return (
    <div role="status" aria-label="Loading moves" className="flex flex-col gap-2 pt-2">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="h-11 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />
      ))}
    </div>
  );
}

/** The moves the query picks, newest first under their day, opened one row at a time or several. */
function Moves({ query, filters, onClear, now }: { query: MoveListQueryParams; filters: MoveFilters; onClear: () => void; now: number }) {
  const { timeZone } = useFormat();
  const list = useMoveList(query);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());

  if (list.isPending) return <Placeholder />;
  if (!list.data) return <LoadFailure error={list.error} fallback="History couldn't be loaded." onRetry={() => void list.refetch()} />;
  if (list.items.length === 0) {
    const plain = filters.result === "all" && setFilterCount({ workflowId: query.workflow_id ?? "", ...filters }) === 0;
    return plain ? (
      <p className="py-10 text-center text-sm text-ink-2">No moves in the last 7 days.</p>
    ) : (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-sm text-ink-2">No moves match these filters.</p>
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    );
  }

  const toggle = (id: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <div role="feed" aria-label="Moves" aria-busy={list.isFetching}>
        {groupByDay(list.items, now, timeZone).map((day) => (
          <div key={day.key}>
            <h3 className="px-2 pt-4 pb-1 text-caption font-semibold text-ink-2">{day.heading}</h3>
            {day.actions.map((move) => (
              <MoveRow key={move.id} move={move} now={now} timeZone={timeZone} open={opened.has(move.id)} onToggle={() => toggle(move.id)} />
            ))}
          </div>
        ))}
      </div>
      <ListEnd list={list} />
    </>
  );
}

/**
 * Production's History: every move across the workspace, newest first, with filters. The product type is the
 * page's, shared with the Board and By step; the rest is this tab's own state, so a reload opens the defaults.
 */
export function History({ workflowId, onWorkflow }: { workflowId: string | null; onWorkflow: (workflowId: string) => void }) {
  const { timeZone } = useFormat();
  const wide = useMediaQuery("(min-width: 768px)");
  const [filters, setFilters] = useState<MoveFilters>(DEFAULT_HISTORY);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const workflows = useWorkflows();
  const current = workflows.data?.find((workflow) => workflow.id === workflowId);
  const version = useWorkflowVersion(current?.id ?? "", current?.version ?? 0, current !== undefined);
  const defects = useDefects();
  const people = useMoveActors(workflowId);

  const options: FilterOptions = {
    productTypes: workflows.data ?? [],
    steps: version.data?.steps ?? [],
    defects: defects.data ?? [],
    people: people.data ?? [],
  };
  const filterProps = {
    workflowId,
    // A step key belongs to its workflow, and the people list is the type's own.
    onWorkflow: (id: string) => {
      setFilters((before) => ({ ...before, stepKey: null, actorId: null }));
      onWorkflow(id);
    },
    filters,
    onChange: (patch: Partial<MoveFilters>) => setFilters((before) => ({ ...before, ...patch })),
    options,
  };
  const today = dayKey(new Date(now).toISOString(), timeZone);

  return (
    <section className="flex flex-col gap-2 rounded-[20px] bg-card p-3 md:p-4">
      {wide ? <WideFilters {...filterProps} /> : <PhoneFilters {...filterProps} />}
      <div className="border-t border-line pt-1">
        {workflowId === null ? (
          <Placeholder />
        ) : (
          <Moves
            query={moveListQuery({ workflowId, ...filters }, today, timeZone)}
            filters={filters}
            onClear={() => setFilters(DEFAULT_HISTORY)}
            now={now}
          />
        )}
      </div>
    </section>
  );
}
