"use client";

import type { ReactNode } from "react";
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
  children,
}: {
  label: string;
  height: number;
  empty?: string | null;
  table: ChartTableProps;
  width?: number;
  children: (size: Size) => ReactNode;
}) {
  return (
    <figure aria-label={label} className="relative m-0">
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
        {empty ? (
          <p className="text-ink-2 pointer-events-none absolute inset-0 m-0 flex items-center justify-center text-center text-[13px]">
            {empty}
          </p>
        ) : null}
      </div>
      <ChartTable {...table} />
    </figure>
  );
}
