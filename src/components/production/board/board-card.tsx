"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { orderHref } from "@/components/orders/order-row";
import { HerePill, LineDue, LineStatus, lineName } from "@/components/production/by-step/line-row";
import type { StepGroup } from "@/lib/api/schema-types";

import { useCardDrag } from "./drag";

/**
 * One order line waiting at a step, as a card: its order (or product, for staff who can't read orders), the
 * product, customer and due day, what it needs, and its pieces here. `tick` and `menu` are the card's tick box
 * and Move to…, left out when the person can't move it.
 */
export function BoardCard({
  line,
  stepKey,
  today,
  selectable,
  picked = false,
  open,
  onToggleOpen,
  tick,
  menu,
  draggable = false,
  children,
}: {
  line: StepGroup;
  stepKey: string;
  /** Whether it has a drag handle: from 768 px, for someone who may move it. */
  draggable?: boolean;
  today: string;
  /** Whether the person may move pieces at all, for "Needs the Final QC skill". */
  selectable: boolean;
  picked?: boolean;
  open: boolean;
  onToggleOpen: () => void;
  tick?: ReactNode;
  menu?: ReactNode;
  /** The open card's pieces. */
  children?: ReactNode;
}) {
  const { group } = line;
  const name = lineName(line);
  const { setNodeRef, handle, isDragging } = useCardDrag(`line:${stepKey}:${group.id}`, draggable ? { stepKey, line } : null, `Drag ${name}`);
  return (
    <li
      ref={setNodeRef}
      data-line-card
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-line bg-card px-2.5 py-2 text-sm",
        picked && "border-violet ring-2 ring-lilac",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {handle}
        {tick}
        {group.order ? (
          <Link href={orderHref({ id: group.order.id })} className="font-semibold text-ink tabular-nums hover:underline">
            #{group.order.number}
          </Link>
        ) : (
          <span className="min-w-0 truncate font-semibold text-ink">{group.product?.name}</span>
        )}
      </div>
      {group.order && group.product && (
        <span className="truncate text-ink" title={group.product.name}>
          {group.product.name}
        </span>
      )}
      {group.customer && (
        <span className="truncate text-caption text-ink-2" title={group.customer.name}>
          {group.customer.name}
        </span>
      )}
      <LineDue line={line} today={today} />
      <LineStatus line={line} selectable={selectable} />
      <div className="flex items-center justify-between gap-2">
        <HerePill count={line.count} />
        <div className="flex items-center">
          {menu}
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Pieces of ${name}`}
            onClick={onToggleOpen}
            className="inline-grid size-11 cursor-pointer place-items-center rounded-lg text-ink-2 outline-none hover:bg-panel-soft hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 md:size-9 pointer-coarse:size-11"
          >
            <ChevronDown aria-hidden className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {open && children}
    </li>
  );
}
