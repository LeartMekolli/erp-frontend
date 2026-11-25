"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import type { StepGroup } from "@/lib/api/schema-types";
import { lineState, toggleLine, togglePiece, type LineSelection } from "@/lib/production/line-selection";
import { fetchLinePieces, useStepLines, type StepLinesFilter } from "@/lib/production/queries";

import { LinePieces } from "./line-pieces";
import { LineRow } from "./line-row";

/** A change to the page's selection, from what it is when the change lands: ticking a line waits for its pieces. */
export type SelectionUpdate = (previous: LineSelection | null) => LineSelection | null;

const th = "px-3 pt-3 pb-2 text-left text-xs font-medium text-ink-2";

/** Every column at 768 px and up, plus the tick box when there is one. */
const columns = (selectable: boolean) => (selectable ? 9 : 8);

const without = (set: ReadonlySet<string>, id: string) => new Set([...set].filter((other) => other !== id));

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-14 text-center text-sm text-ink-2">{children}</p>;
}

/**
 * The order lines waiting at one step, due soonest first by default, 50 a page. Ticking a line takes every
 * piece there the person may work, read page by page from erp-api, so a line longer than one page is ticked
 * whole. Opening a line lists its pieces to tick one by one.
 */
export function LinesTable({
  filter,
  stepName,
  selection,
  onSelection,
  selectable,
  today,
}: {
  filter: StepLinesFilter;
  /** The step's name, for the empty list. */
  stepName: string;
  selection: LineSelection | null;
  onSelection: (update: SelectionUpdate) => void;
  /** Whether the person may move pieces (`workflow.move`); without it there are no tick boxes. */
  selectable: boolean;
  /** The workspace's today, `YYYY-MM-DD`. */
  today: string;
}) {
  const { stepKey } = filter;
  const client = useQueryClient();
  const list = useStepLines(filter, true);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  // A selection made at another step says nothing about this one: the same line can wait at both.
  const here = selection?.stepKey === stepKey ? selection : null;

  async function tick(line: StepGroup) {
    const id = line.group.id;
    if (lineState(here, line) === true) {
      onSelection((previous) => toggleLine(previous, stepKey, line, []));
      return;
    }
    setBusy((current) => new Set(current).add(id));
    setFailed((current) => without(current, id));
    try {
      const pieces = await fetchLinePieces(client, id, stepKey);
      const workable = pieces.filter((piece) => piece.may_work).map((piece) => piece.id);
      // Ticked in full meanwhile (its pieces, one by one): leave it ticked rather than toggle it off.
      onSelection((previous) =>
        lineState(previous?.stepKey === stepKey ? previous : null, line) === true ? previous : toggleLine(previous, stepKey, line, workable),
      );
    } catch {
      setFailed((current) => new Set(current).add(id));
    } finally {
      setBusy((current) => without(current, id));
    }
  }

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <p role="status" className="sr-only">
          Loading lines…
        </p>
        {[0, 1, 2, 3, 4].map((n) => (
          <div key={n} aria-hidden className="h-12 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  const lines = list.items;

  if (lines.length === 0 && list.isError) {
    return (
      <div className="px-3">
        <LoadFailure error={list.error} fallback="The lines couldn't be loaded." onRetry={() => void list.refetch()} />
      </div>
    );
  }

  if (lines.length === 0) {
    return <Empty>{filter.q ? `Nothing waiting at ${stepName} matches your search.` : `Nothing waiting at ${stepName}.`}</Empty>;
  }

  return (
    <div>
      <table className="w-full border-collapse">
        <caption className="sr-only">{`Lines waiting at ${stepName}`}</caption>
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className={`${th} w-10 pr-0`}>
                <span className="sr-only">Select</span>
              </th>
            )}
            <th scope="col" className={`${th} md:hidden`}>
              <span className="sr-only">Line</span>
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Order
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Customer
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Product
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Status
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              Due
            </th>
            <th scope="col" className={`${th} hidden text-right md:table-cell`}>
              Here
            </th>
            <th scope="col" className={`${th} w-12`}>
              <span className="sr-only">Pieces</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const id = line.group.id;
            const isOpen = open.has(id);
            return (
              <Fragment key={id}>
              <LineRow
                line={line}
                today={today}
                selectable={selectable}
                checked={lineState(here, line)}
                busy={busy.has(id)}
                failed={failed.has(id)}
                open={isOpen}
                onTick={() => void tick(line)}
                onToggleOpen={() => setOpen((current) => (current.has(id) ? without(current, id) : new Set(current).add(id)))}
              />
              {isOpen && (
                <tr>
                  <td colSpan={columns(selectable)} className="px-3 md:pl-13">
                    <LinePieces
                      line={line}
                      stepKey={stepKey}
                      selectable={selectable}
                      selection={here}
                      onTogglePiece={(piece) => onSelection((previous) => togglePiece(previous, stepKey, line, piece))}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="px-3">
        <ListEnd list={list} />
      </div>
    </div>
  );
}
