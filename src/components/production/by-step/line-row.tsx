"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CustomerInitials } from "@/components/orders/customer-initials";
import { orderHref } from "@/components/orders/order-row";
import { Checkbox } from "@/components/ui/checkbox";
import type { StepGroup } from "@/lib/api/schema-types";
import { formatDayMonth } from "@/lib/format/dates";
import { dueWords } from "@/lib/production/by-step";

/** What a line is called in labels: its order number, or its product for staff who can't read orders. */
export function lineName(line: StepGroup): string {
  const { order, product } = line.group;
  if (order) return `#${order.number}`;
  return product?.name ?? "this line";
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

function Cell({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("border-t border-line px-3 py-2.5 align-middle", className)}>{children}</td>;
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />;
}

/** What the line needs, each as a word with its dot; nothing when it's on time and in hand. */
function Status({ line, selectable }: { line: StepGroup; selectable: boolean }) {
  const { group } = line;
  const items: ReactNode[] = [];
  if (group.late)
    items.push(
      <span key="late" className="inline-flex items-center gap-2 font-semibold text-late">
        <Dot className="bg-late" />
        Late
      </span>,
    );
  if (line.in_rework > 0)
    items.push(
      <span key="rework" className="inline-flex items-center gap-2 font-medium text-ink">
        <Dot className="bg-collect" />
        {`${line.in_rework} being redone`}
      </span>,
    );
  if (line.to_inspect > 0)
    items.push(
      <span key="inspect" className="inline-flex items-center gap-2 font-medium text-ink">
        <Dot className="bg-violet" />
        {`Check in full: ${line.to_inspect}`}
      </span>,
    );
  if (group.partner)
    items.push(
      <span key="partner" className="inline-flex items-center gap-2 text-ink-2">
        <Dot className="bg-ink-2" />
        {`With ${group.partner.name}`}
      </span>,
    );
  if (selectable && line.workable === 0)
    items.push(
      <span key="skill" className="text-caption text-ink-2">
        Needs a skill you don&apos;t have
      </span>,
    );
  if (items.length === 0) return null;
  return <span className="flex flex-col items-start gap-0.5">{items}</span>;
}

function Due({ line, today }: { line: StepGroup; today: string }) {
  const { due_on, late } = line.group;
  if (!due_on) return null;
  const words = dueWords(due_on, today);
  return (
    <span className="flex flex-col">
      <span className={cn("tabular-nums", late ? "font-semibold text-late" : "text-ink")}>{formatDayMonth(`${due_on}T00:00:00Z`, "UTC")}</span>
      {words && <span className={cn("text-caption", late ? "text-late" : "text-ink-2")}>{words}</span>}
    </span>
  );
}

/** Ticking the line failed because its pieces couldn't be read: says so, with a way to tick it again. */
function TickFailed({ name, onRetry }: { name: string; onRetry: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-caption text-late">
      Its pieces couldn&apos;t be loaded.
      <button
        type="button"
        aria-label={`Try again to select ${name}`}
        onClick={onRetry}
        className="min-h-6 cursor-pointer rounded font-semibold underline underline-offset-2 outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
      >
        Try again
      </button>
    </span>
  );
}

function Here({ count }: { count: number }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-lilac px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap text-violet-ink tabular-nums">
      {plural(count, "piece")}
    </span>
  );
}

/**
 * One order line waiting at the step. From 768 px a table row with every column; below that one stacked
 * cell: number and Late, product, customer and due day, as the phone sketch. The tick box and the button
 * that opens the line's pieces are the same at every size.
 */
export function LineRow({
  line,
  today,
  selectable,
  checked,
  busy,
  failed,
  open,
  onTick,
  onToggleOpen,
}: {
  line: StepGroup;
  today: string;
  /** Whether the person may move pieces at all; without it the row has no tick box. */
  selectable: boolean;
  checked: boolean | "indeterminate";
  /** The line's pieces are being read before it's ticked. */
  busy: boolean;
  /** Reading the line's pieces failed the last time it was ticked. */
  failed: boolean;
  open: boolean;
  onTick: () => void;
  onToggleOpen: () => void;
}) {
  const { group } = line;
  const name = lineName(line);
  const due = group.due_on ? formatDayMonth(`${group.due_on}T00:00:00Z`, "UTC") : null;
  return (
    <tr data-line-row className={cn("text-sm", checked !== false && "bg-lilac/50")}>
      {selectable && (
        <Cell className="w-10 pr-0">
          <span className="grid size-11 place-items-center md:size-6 pointer-coarse:size-11">
            <Checkbox
              checked={checked}
              disabled={busy || line.workable === 0}
              aria-busy={busy}
              onCheckedChange={onTick}
              aria-label={`Select ${name}`}
              // The box's hit area reaches 44 px on touch screens, filling the space kept for it.
              className="pointer-coarse:after:-inset-3.5"
            />
          </span>
        </Cell>
      )}

      {/* Phone: the line in one cell. `w-full max-w-0` cuts long text instead of widening the table. */}
      <Cell className="w-full max-w-0 md:hidden">
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {group.order && <span className="font-semibold text-ink tabular-nums">#{group.order.number}</span>}
              {group.late && <span className="font-semibold text-late">Late</span>}
            </span>
            <Here count={line.count} />
          </span>
          {group.product && <span className="truncate text-ink">{group.product.name}</span>}
          {(group.customer || due) && (
            <span className="truncate text-caption text-ink-2">{[group.customer?.name, due].filter(Boolean).join(" · ")}</span>
          )}
          {(line.in_rework > 0 || line.to_inspect > 0 || group.partner) && (
            <span className="truncate text-caption font-medium text-ink">
              {[
                line.in_rework > 0 && `${line.in_rework} being redone`,
                line.to_inspect > 0 && `Check in full: ${line.to_inspect}`,
                group.partner && `With ${group.partner.name}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {selectable && line.workable === 0 && <span className="text-caption text-ink-2">Needs a skill you don&apos;t have</span>}
          {failed && <TickFailed name={name} onRetry={onTick} />}
        </span>
      </Cell>

      <Cell className="hidden w-20 md:table-cell">
        {group.order && (
          <Link href={orderHref({ id: group.order.id })} className="text-ink-2 tabular-nums hover:text-ink hover:underline">
            #{group.order.number}
          </Link>
        )}
      </Cell>
      <Cell className="hidden max-w-0 md:table-cell md:w-1/4">
        {group.customer && (
          <span className="flex items-center gap-2.5">
            <CustomerInitials customer={group.customer} />
            <span className="truncate font-semibold text-ink" title={group.customer.name}>
              {group.customer.name}
            </span>
          </span>
        )}
      </Cell>
      <Cell className="hidden max-w-0 md:table-cell md:w-1/4">
        {group.product && (
          <span className="block truncate text-ink" title={group.product.name}>
            {group.product.name}
          </span>
        )}
        {failed && <TickFailed name={name} onRetry={onTick} />}
      </Cell>
      <Cell className="hidden md:table-cell">
        <Status line={line} selectable={selectable} />
      </Cell>
      <Cell className="hidden whitespace-nowrap md:table-cell">
        <Due line={line} today={today} />
      </Cell>
      <Cell className="hidden text-right md:table-cell">
        <Here count={line.count} />
      </Cell>
      <Cell className="w-12 px-1 text-right">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Pieces of ${name}`}
          onClick={onToggleOpen}
          className="inline-grid size-11 cursor-pointer place-items-center rounded-lg text-ink-2 outline-none hover:bg-panel-soft hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </Cell>
    </tr>
  );
}
