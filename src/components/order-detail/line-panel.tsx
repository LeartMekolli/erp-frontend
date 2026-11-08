"use client";

import { cn } from "cn";

import type { Order, OrderLine, OrderPart } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";

import { LinePartnerTag } from "./line-partner-tag";
import { LinePicks } from "./line-picks";
import { LineTabs } from "./line-tabs";

const LINE_STATE: Record<OrderPart["state"], string> = {
  in_production: "In production",
  ready: "Ready",
  cancelled: "Cancelled",
};

/**
 * One line of an order, or one part of an assembly nested under its line:
 * what it is, what it was made with and who has it.
 */
export function LinePanel({
  line,
  order,
  now,
  index,
  nested = false,
}: {
  line: OrderLine | OrderPart;
  order: Order;
  /** When the order was loaded: what an offer's deadline is compared with. */
  now: number;
  /** The panel's place on the page: only the first few load their progress up front. */
  index: number;
  nested?: boolean;
}) {
  const { money } = useFormat();
  const title = `${line.quantity} × ${line.product.name}`;
  const cancelled = line.state === "cancelled";
  const Heading = nested ? "h3" : "h2";
  const parts = "parts" in line ? line.parts : [];

  return (
    <section
      aria-label={title}
      className={cn("flex min-w-0 flex-col gap-1.5", nested ? "border-t border-line pt-3" : "rounded-[20px] bg-card px-5 py-4")}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Heading className={cn("min-w-0 font-semibold break-words", !nested && "text-base", cancelled && "text-ink-2")}>{title}</Heading>
        <span className="text-caption font-medium text-ink-2">{LINE_STATE[line.state]}</span>
        <span className="ml-auto text-sm text-ink-2 tabular-nums">
          {money(line.unit_price, order.currency)} each · {money(line.total, order.currency)}
        </span>
      </div>
      <LinePicks line={line} />
      {!cancelled && (
        <div className="pt-1">
          <LinePartnerTag partner={line.partner} now={now} />
        </div>
      )}
      {!cancelled && line.group_id && <LineTabs groupId={line.group_id} index={index} />}
      {parts.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          {[...parts]
            .sort((a, b) => a.position - b.position)
            .map((part) => (
              <LinePanel key={part.id} line={part} order={order} now={now} index={index + part.position + 1} nested />
            ))}
        </div>
      )}
    </section>
  );
}
