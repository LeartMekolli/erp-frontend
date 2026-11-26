"use client";

import Link from "next/link";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { orderHref } from "@/components/orders/order-row";
import { MoveFacts, MovePhotos } from "@/components/production/move-look";
import type { MoveListGroup, MoveListItem } from "@/lib/api/schema-types";
import { leaveArrivalNote, opensHere } from "@/lib/navigation/arrival-note";
import { overrideText } from "@/lib/production/history";
import { lineName } from "@/lib/production/move-list";
import { useMoveRows } from "@/lib/production/queries";
import type { StepRules } from "@/lib/production/shape";
import { staffPhotos } from "@/lib/production/staff";

const plural = (count: number) => `${count} ${count === 1 ? "piece" : "pieces"}`;

/**
 * One line's pieces in the move, read from erp-api by move and line, never grouped here. Each piece opens its
 * order at its story: the plain `/orders/:id`, with the piece left as an arrival note.
 */
function LinePieces({ moveId, line }: { moveId: string; line: MoveListGroup }) {
  const rows = useMoveRows(moveId, line.group.id, true);
  const name = lineName(line.group);
  const order = line.group.order;
  const heading = `${name} · ${plural(line.count)}`;

  let body;
  if (rows.isPending) {
    body = <div role="status" aria-label={`Loading the pieces of ${name}`} className="h-8 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />;
  } else if (!rows.data) {
    body = <LoadFailure error={rows.error} fallback="These pieces couldn't be loaded." onRetry={() => void rows.refetch()} />;
  } else {
    body = (
      <>
        <ul aria-label={heading} className="flex flex-wrap gap-1.5">
          {rows.items.map((row) => {
            const label = `${name} · ${row.work_order.label}`;
            return (
              <li key={row.id} className="rounded-lg border border-line bg-card text-caption tabular-nums">
                {order ? (
                  <Link
                    href={orderHref(order)}
                    onClick={(event) => {
                      if (opensHere(event)) leaveArrivalNote(orderHref(order), { piece: row.work_order.id });
                    }}
                    className="inline-flex min-h-8 items-center px-2 hover:underline pointer-coarse:min-h-11"
                  >
                    {label}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-8 items-center px-2">{label}</span>
                )}
              </li>
            );
          })}
        </ul>
        <ListEnd list={rows} more="Show more pieces" auto={false} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-caption font-semibold text-ink-2">{heading}</h3>
      {body}
    </div>
  );
}

/** An opened move: what was written with it and its photos, then each line it touched with that line's pieces. */
export function MoveDetails({ move, rules }: { move: MoveListItem; rules: StepRules[] }) {
  const override = overrideText(move, rules);
  const written = move.comment !== null || move.answers.length > 0 || move.photos.length > 0 || override !== null;
  return (
    <div className="flex flex-col gap-3">
      {written && (
        <div role="group" aria-label="What came with it" className="flex min-w-0 gap-3.5 rounded-[14px] border border-line bg-card px-3.5 py-3">
          <MovePhotos photos={staffPhotos(move.photos)} at={move.from_step?.name ?? null} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <MoveFacts comment={move.comment} answers={move.answers} override={override} />
          </div>
        </div>
      )}
      {move.groups.map((line) => (
        <LinePieces key={line.group.id} moveId={move.id} line={line} />
      ))}
    </div>
  );
}
