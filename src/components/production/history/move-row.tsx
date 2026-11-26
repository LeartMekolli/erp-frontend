"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { cn } from "cn";

import { orderHref } from "@/components/orders/order-row";
import { moveIcon } from "@/components/production/move-look";
import type { MoveListItem } from "@/lib/api/schema-types";
import { lineName, moveTime, moveWords, partnersOf } from "@/lib/production/move-list";

/** What the row is read out as: who did what, and where. */
export function moveSummary(move: MoveListItem): string {
  const at = move.from_step ? `, at ${move.from_step.name}` : "";
  return `${move.actor.name} ${moveWords(move)}${at}`;
}

/**
 * One move in History: what it did and where, who made it and for which partner, each line it touched with its
 * count there, and when. Fails and corrections stand out; passes are quieter. The chevron opens `children`.
 */
export function MoveRow({
  move,
  now,
  timeZone,
  open,
  onToggle,
  children,
}: {
  move: MoveListItem;
  now: number;
  timeZone: string;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const detailsId = useId();
  const summary = moveSummary(move);
  const notable = move.kind !== "pass";
  const { Icon, tone } = moveIcon(move);
  const partners = partnersOf(move);

  return (
    <article aria-label={summary} className={cn("border-t border-line first:border-t-0", open && "rounded-xl border-transparent bg-panel-soft")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-1 px-2 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_5.5rem_auto] md:items-center">
        <div className="min-w-0">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full", tone)}>
              <Icon className="size-3" />
            </span>
            <span className={notable ? "font-semibold text-ink" : "font-medium text-ink-2"}>{moveWords(move)}</span>
            {move.from_step && <span className="text-sm text-ink-2">at {move.from_step.name}</span>}
          </p>
          <p className="mt-0.5 truncate pl-7 text-caption text-ink-2">
            {move.actor.name}
            {partners.length > 0 && (
              <>
                {" · "}
                <span>for {partners.join(", ")}</span>
              </>
            )}
          </p>
        </div>
        <ul aria-label="Lines" className="col-span-3 col-start-1 row-start-2 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 pl-7 text-sm md:col-span-1 md:col-start-2 md:row-start-1 md:pl-0">
          {move.groups.map((line) => (
            <li key={line.group.id} className={cn("tabular-nums", notable ? "text-ink" : "text-ink-2")}>
              {line.group.order ? (
                <Link href={orderHref(line.group.order)} className="font-medium hover:underline">
                  {lineName(line.group)}
                </Link>
              ) : (
                <span className="font-medium">{lineName(line.group)}</span>
              )}
              <span className="text-ink-2"> · {line.count}</span>
            </li>
          ))}
        </ul>
        <time dateTime={move.created_at} className="pt-0.5 text-right text-caption whitespace-nowrap text-ink-2 tabular-nums md:pt-0">
          {moveTime(move.created_at, now, timeZone)}
        </time>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          aria-label={`Details: ${summary}`}
          onClick={onToggle}
          className="-my-1 grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink focus-visible:outline-2 focus-visible:outline-violet pointer-coarse:size-11"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div id={detailsId} className="px-2 pb-3 md:pl-9">
          {children}
        </div>
      )}
    </article>
  );
}
