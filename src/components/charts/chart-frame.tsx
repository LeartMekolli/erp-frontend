"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { ParentSize } from "@visx/responsive";

import { ChartTable, type ChartTableProps } from "./chart-table";

export type { ChartTableProps };

type Size = { width: number; height: number };

/**
 * Every chart's shell: a labelled figure, the measured drawing area (hidden from
 * screen readers) and the data table that stands in for it. Pass `width` to skip
 * measuring (tests: jsdom has no layout).
 */
export function ChartFrame({
  label,
  height,
  empty,
  table,
  width,
  focus,
  overlay,
  tone = "light",
  children,
}: {
  label: string;
  /** The surface it sits on: the empty message's colour follows it (the dark hero). */
  tone?: "light" | "dark";
  height: number;
  empty?: string | null;
  table: ChartTableProps;
  width?: number;
  /** Keyboard access, spread on the figure: focus can't live in the `aria-hidden` drawing. */
  focus?: { tabIndex: 0; onKeyDown: (e: KeyboardEvent) => void; onBlur: () => void };
  /** Shown over the drawing but outside the hidden area, in a live region (the tooltip). */
  overlay?: ReactNode;
  children: (size: Size) => ReactNode;
}) {
  return (
    <figure
      aria-label={label}
      className={
        focus
          ? "relative m-0 rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
          : "relative m-0"
      }
      {...focus}
    >
      <div className="relative" style={{ height }}>
        <div aria-hidden="true" style={{ height }}>
          {width !== undefined ? (
            <div style={{ width, height }}>{children({ width, height })}</div>
          ) : (
            <ParentSize debounceTime={50} style={{ height }}>
              {({ width: measured }) =>
                measured > 0 ? children({ width: measured, height }) : null
              }
            </ParentSize>
          )}
        </div>
        {overlay !== undefined ? <div aria-live="polite" className="pointer-events-none absolute inset-0">{overlay}</div> : null}
        {empty ? (
          <p
            className={`${tone === "dark" ? "text-[#b9b6c9]" : "text-ink-2"} pointer-events-none absolute inset-0 m-0 flex items-center justify-center text-center text-[13px]`}
          >
            {empty}
          </p>
        ) : null}
      </div>
      <ChartTable {...table} />
    </figure>
  );
}
