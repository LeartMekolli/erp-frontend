"use client";

import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import type { NeedsReason, OrderCounts } from "@/lib/api/schema-types";
import { daysBetween, workspaceToday } from "@/lib/orders/labels";
import { useOrderCounts, useTileOrders } from "@/lib/orders/queries";
import { NEEDS_REASONS } from "@/lib/orders/view";

import { CustomerInitials } from "./customer-initials";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Each reason's colour in the bar and legend, and how the legend names it. */
const REASON: Record<NeedsReason, { colour: string; words: string }> = {
  late: { colour: "bg-late", words: "late" },
  to_ship: { colour: "bg-ship", words: "to ship" },
  to_collect: { colour: "bg-collect", words: "to collect" },
  due_soon: { colour: "bg-violet", words: "due soon" },
};

const tileBox = "flex min-h-24 flex-col gap-1 rounded-[20px] bg-card p-3 text-left md:min-h-36 md:gap-1.5 md:px-5 md:py-[18px]";
const tileTitle = "text-caption font-medium text-ink-2";
const tileNumber = "text-2xl font-semibold tracking-[-0.04em] tabular-nums md:text-[34px] md:leading-tight";
const tileFoot = "mt-auto hidden text-caption text-ink-2 md:block";

/**
 * "Need you today" and the three smaller tiles above the Orders table. They
 * describe the whole workspace, never the table's filters; picking a reason
 * hands it back so the table can show those orders.
 */
export function Tiles({ onPickReason }: { onPickReason: (reason: NeedsReason | null) => void }) {
  const counts = useOrderCounts({});
  const overdue = useOrderCounts({ payment_state: "overdue" });

  if (counts.isPending) return <Placeholder />;
  if (!counts.data) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[20px] bg-card px-5 py-[18px]">
        <p className="text-sm text-ink-2">Couldn&apos;t load the numbers.</p>
        <Button variant="secondary" onClick={() => void Promise.all([counts.refetch(), overdue.refetch()])}>
          Try again
        </Button>
      </div>
    );
  }

  const { needs_you: needs, states } = counts.data;
  return (
    <div className="grid grid-cols-3 gap-3 md:gap-3.5 xl:grid-cols-[1.7fr_1fr_1fr_1fr]">
      <Hero counts={counts.data} open={states.awaiting_payment + states.in_production + states.ready} onPickReason={onPickReason} />
      <Tile title="Ready to ship" count={needs.to_ship} onPick={() => onPickReason("to_ship")}>
        <ReadyFoot />
      </Tile>
      <Tile title="Awaiting payment" count={needs.to_collect} unit="orders" onPick={() => onPickReason("to_collect")}>
        {overdue.data && <span>{`${overdue.data.needs_you.to_collect} overdue`}</span>}
      </Tile>
      <Tile title="Late" count={needs.late} accent onPick={() => onPickReason("late")}>
        <LateFoot />
      </Tile>
    </div>
  );
}

function Hero({
  counts,
  open,
  onPickReason,
}: {
  counts: OrderCounts;
  open: number;
  onPickReason: (reason: NeedsReason | null) => void;
}) {
  const needs = counts.needs_you;
  return (
    <section
      aria-labelledby="need-you-today"
      className="col-span-3 flex flex-col gap-1.5 rounded-[20px] bg-linear-120 from-lilac via-[#f4f1ff] to-[#e3dcfb] px-5 py-[18px] xl:col-span-1"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="need-you-today" className="text-caption font-medium text-[#4d4570]">
            Need you today
          </h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[34px] leading-tight font-semibold tracking-[-0.04em] tabular-nums">{needs.total}</span>
            <span className="text-sm font-medium text-ink-2">{`of ${open} open orders`}</span>
          </p>
        </div>
        <Button variant="secondary" className="rounded-full border-transparent" onClick={() => onPickReason(null)}>
          Review
        </Button>
      </div>
      <div aria-hidden className="my-2 flex h-2.5 gap-1">
        {NEEDS_REASONS.filter((reason) => needs[reason] > 0).map((reason) => (
          <div
            key={reason}
            onClick={() => onPickReason(reason)}
            style={{ flexGrow: needs[reason] }}
            className={`cursor-pointer rounded-full ${REASON[reason].colour}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {NEEDS_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            disabled={needs[reason] === 0}
            onClick={() => onPickReason(reason)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-[#4d4570] tabular-nums hover:bg-white/50 focus-visible:outline-2 focus-visible:outline-violet disabled:opacity-60 md:min-h-8 pointer-coarse:min-h-11"
          >
            <span aria-hidden className={`size-2 rounded-full ${REASON[reason].colour}`} />
            {`${needs[reason]} ${REASON[reason].words}`}
          </button>
        ))}
      </div>
    </section>
  );
}

/** A smaller tile: a button to its orders, or quietly "None" when there are none. */
function Tile({
  title,
  count,
  unit,
  accent = false,
  onPick,
  children,
}: {
  title: string;
  count: number;
  unit?: string;
  accent?: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  if (count === 0) {
    return (
      <section aria-labelledby={`tile-${title}`} className={tileBox}>
        <h2 id={`tile-${title}`} className={tileTitle}>
          {title}
        </h2>
        <p className="text-sm text-ink-2 md:mt-1">None</p>
      </section>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      className={`${tileBox} group transition-shadow hover:shadow-[0_0_0_1px_var(--color-line)] focus-visible:outline-2 focus-visible:outline-violet`}
    >
      <span className={`flex items-center justify-between ${tileTitle}`}>
        {title}
        <span aria-hidden className="hidden size-7 place-items-center rounded-full border border-line text-ink group-hover:bg-ground md:grid">
          <ArrowUpRight className="size-3.5" />
        </span>
      </span>
      <span className={`${tileNumber} ${accent ? "text-late" : "text-ink"}`}>
        {count}
        {unit && <span className="ml-1.5 text-sm font-medium tracking-normal text-ink-2">{unit}</span>}
      </span>
      <span className={tileFoot}>{children}</span>
    </button>
  );
}

function useToday(): string | null {
  const { data: me } = useMe();
  return me ? workspaceToday(me.workspace.timezone) : null;
}

/** Up to three customers' initials, and when the first order was due. */
function ReadyFoot() {
  const today = useToday();
  const { data: orders } = useTileOrders("to_ship", 3);
  const first = orders?.[0];
  if (!first || !today) return null;
  const days = daysBetween(today, first.promised_on);
  let due: ReactNode;
  if (days < 0) due = <span className="font-semibold text-late">{`First was due ${plural(-days, "day")} ago`}</span>;
  else if (days === 0) due = "First due today";
  else if (days === 1) due = "First due tomorrow";
  else due = `First due in ${days} days`;
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex">
        {orders.map((order) => (
          <CustomerInitials key={order.id} customer={order.customer} className="-ml-1.5 border-2 border-card first:ml-0" />
        ))}
      </span>
      <span>{due}</span>
    </span>
  );
}

/** The most overdue order's customer, and how late it is. */
function LateFoot() {
  const today = useToday();
  const { data: orders } = useTileOrders("late", 1);
  const worst = orders?.[0];
  if (!worst || !today) return null;
  return <span>{`${worst.customer.name} · ${plural(daysBetween(worst.promised_on, today), "day")} late`}</span>;
}

function Placeholder() {
  return (
    <div className="grid grid-cols-3 gap-3 md:gap-3.5 xl:grid-cols-[1.7fr_1fr_1fr_1fr]">
      <p role="status" className="sr-only">
        Loading the numbers…
      </p>
      <div aria-hidden className="col-span-3 h-36 animate-pulse rounded-[20px] bg-lilac xl:col-span-1" />
      {[0, 1, 2].map((n) => (
        <div key={n} aria-hidden className="h-24 animate-pulse rounded-[20px] bg-card md:h-36" />
      ))}
    </div>
  );
}
