"use client";

import { TooltipWithBounds } from "@visx/tooltip";
import { cn } from "cn";

import { CHART } from "./tokens";

export type ChartTooltipRow = { key?: string; label: string; value: string; strong?: boolean };

/** The dark card that follows the pointer or the keyboard focus on a chart. */
export function ChartTooltip({
  open,
  left,
  top,
  tone = "light",
  title,
  rows,
}: {
  open: boolean;
  left: number;
  top: number;
  tone?: "light" | "dark";
  title: string;
  rows: ChartTooltipRow[];
}) {
  if (!open) return null;
  return (
    <TooltipWithBounds
      unstyled
      applyPositionStyle
      left={left}
      top={top}
      offsetLeft={12}
      offsetTop={12}
      className={cn(
        "bg-ink pointer-events-none min-w-[150px] rounded-[10px] px-3 py-[9px] text-[12px] text-white",
        tone === "dark"
          ? "shadow-[0_8px_24px_rgba(22,20,28,.25)]"
          : "shadow-[0_8px_24px_rgba(22,20,28,.18)]",
      )}
    >
      <div style={{ color: CHART.dark.label }}>{title}</div>
      {rows.map((row, i) => (
        <div key={`${i}-${row.label}`} className="mt-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            {row.key ? (
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-3.5 rounded-full"
                style={{ backgroundColor: row.key }}
              />
            ) : null}
            {row.label}
          </span>
          <span className={cn("font-semibold", row.strong && "text-[14px]")}>{row.value}</span>
        </div>
      ))}
    </TooltipWithBounds>
  );
}
