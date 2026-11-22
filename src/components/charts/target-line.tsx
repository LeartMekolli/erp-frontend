"use client";

import { useEffect, useId, useState, type PointerEvent, type ReactNode } from "react";
import { localPoint } from "@visx/event";
import { scaleLinear, scaleTime } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { Threshold } from "@visx/threshold";
import { bisector, ticks as d3Ticks } from "d3-array";
import { curveMonotoneX } from "d3-shape";

import { ChartFrame } from "./chart-frame";
import { ChartTooltip, type ChartTooltipRow } from "./chart-tooltip";
import { percentAxis } from "./scale-helpers";
import { CHART } from "./tokens";
import { useChartKeys } from "./use-chart-keys";

export type TargetPoint = {
  /** ISO date, YYYY-MM-DD. */
  at: string;
  /** 0 to 1; null when there was nothing to measure. */
  rate: number | null;
};

const MARGIN = { left: 46, right: 12, top: 18, bottom: 26 };
const INK = "#16141c";
const LATE_INK = "#b3262f";
const SURFACE = "#ffffff";
const STEP = 0.05;

/** A local-time date, so ticks fall on the user's midnights. */
function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

type Size = { width: number; height: number };
type Dot = { x: number; y: number };

function isUnder(rate: number | null, target: number | null): boolean {
  return rate !== null && target !== null && rate < target;
}

/** Both the drawing and the tooltip position come from these, so they can't drift apart. */
function layoutFor(points: TargetPoint[], target: number | null, { width, height }: Size) {
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);
  const hasData = points.some((p) => p.rate !== null);

  let low = 1;
  for (const p of points) if (p.rate !== null) low = Math.min(low, p.rate);
  if (target !== null) low = Math.min(low, target);
  // A little room under the lowest value, on a 5% step, never below zero.
  const floor = hasData
    ? Math.max(Math.floor((low - STEP) / STEP + 1e-9) * STEP, 0)
    : 0;
  const bottom = Number(floor.toPrecision(12));
  const ticks = d3Ticks(bottom, 1, 4).filter((t) => t >= bottom && t <= 1);

  const yScale = scaleLinear<number>({ domain: [bottom, 1], range: [innerHeight, 0] });
  const dates = points.map((p) => toDate(p.at));
  const xScale = scaleTime<number>({
    domain: dates.length > 0 ? [dates[0], dates[dates.length - 1]] : [new Date(0), new Date(1)],
    range: [0, innerWidth],
  });
  return { innerWidth, innerHeight, hasData, ticks, xScale, yScale };
}

type Layout = ReturnType<typeof layoutFor>;

/** Runs of consecutive non-null rates: a null breaks the line, it is never drawn as zero. */
function segmentsOf(points: TargetPoint[], layout: Layout): Dot[][] {
  const runs: Dot[][] = [];
  let run: Dot[] = [];
  for (const p of points) {
    if (p.rate === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push({ x: layout.xScale(toDate(p.at)), y: layout.yScale(p.rate) });
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** Up to five evenly spaced indexes for the bottom labels. */
function labelIndexes(count: number): number[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i);
  return [0, 1, 2, 3, 4].map((i) => Math.round((i * (count - 1)) / 4));
}

function tooltipRows(p: TargetPoint, target: number | null): ChartTooltipRow[] {
  const rows: ChartTooltipRow[] = [
    {
      key: CHART.violet,
      label: "On time",
      value: p.rate === null ? "No data" : percentAxis(p.rate),
      strong: true,
    },
  ];
  if (target !== null) rows.push({ label: "Target", value: percentAxis(target) });
  if (isUnder(p.rate, target)) rows.push({ label: "▼ Under target", value: "" });
  return rows;
}

function Drawing({
  size,
  points,
  target,
  dateLabel,
  active,
  onActive,
  onSize,
}: {
  size: Size;
  points: TargetPoint[];
  target: number | null;
  dateLabel: (iso: string) => string;
  active: number | null;
  onActive: (index: number | null) => void;
  onSize: (size: Size) => void;
}) {
  const thresholdId = useId();
  const { width, height } = size;

  // The tooltip lives outside the drawing and needs the size to place itself.
  useEffect(() => {
    onSize({ width, height });
  }, [width, height, onSize]);

  const layout = layoutFor(points, target, size);
  const { innerWidth, innerHeight, hasData, ticks, xScale, yScale } = layout;
  const runs = hasData ? segmentsOf(points, layout) : [];
  const targetY = target !== null ? yScale(target) : 0;

  const activePoint = active !== null ? points[active] : undefined;
  const activeX = activePoint ? xScale(toDate(activePoint.at)) : 0;

  function onPointerMove(e: PointerEvent<SVGRectElement>) {
    const at = localPoint(e);
    if (!at || points.length === 0) return;
    const date = xScale.invert(at.x - MARGIN.left);
    onActive(bisector<TargetPoint, Date>((p) => toDate(p.at)).center(points, date));
  }

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {ticks.map((tick) => (
          <g key={tick} transform={`translate(0,${yScale(tick)})`}>
            <line x1={0} x2={innerWidth} stroke={CHART.grid} strokeWidth={1} />
            <text
              x={-8}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill={CHART.axis}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {percentAxis(tick)}
            </text>
          </g>
        ))}
        {labelIndexes(points.length).map((i) => (
          <text
            key={i}
            x={xScale(toDate(points[i].at))}
            y={innerHeight + 18}
            textAnchor="middle"
            fontSize={11}
            fill={CHART.axis}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {dateLabel(points[i].at)}
          </text>
        ))}

        {hasData && target !== null ? (
          <Threshold<TargetPoint>
            id={thresholdId}
            data={points}
            defined={(p) => p.rate !== null}
            x={(p) => xScale(toDate(p.at))}
            y0={(p) => yScale(p.rate ?? 0)}
            y1={targetY}
            clipAboveTo={0}
            clipBelowTo={innerHeight}
            curve={curveMonotoneX}
            belowAreaProps={{ fill: CHART.status.lateTint }}
            aboveAreaProps={{ fill: "transparent" }}
          />
        ) : null}

        {hasData && target !== null ? (
          <>
            <line
              x1={0}
              x2={innerWidth}
              y1={targetY}
              y2={targetY}
              stroke={LATE_INK}
              strokeWidth={1}
              strokeLinecap="round"
            />
            <text
              x={innerWidth}
              y={targetY - 6}
              textAnchor="end"
              fontSize={11}
              fontWeight={600}
              fill={LATE_INK}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {`Target ${percentAxis(target)}`}
            </text>
          </>
        ) : null}

        {runs.map((run, i) =>
          run.length > 1 ? (
            <LinePath<Dot>
              key={`rate-${i}`}
              data={run}
              x={(d) => d.x}
              y={(d) => d.y}
              curve={curveMonotoneX}
              fill="none"
              stroke={CHART.violet}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              data-series="rate"
            />
          ) : (
            // A lone rate between two gaps has no line to draw: show it as a dot.
            <circle
              key={`rate-${i}`}
              cx={run[0].x}
              cy={run[0].y}
              r={4}
              fill={CHART.violet}
              stroke={SURFACE}
              strokeWidth={2}
            />
          ),
        )}

        {hasData
          ? points.map((p) =>
              p.rate !== null && isUnder(p.rate, target) ? (
                <circle
                  key={p.at}
                  data-under=""
                  cx={xScale(toDate(p.at))}
                  cy={yScale(p.rate)}
                  r={5}
                  fill={CHART.status.late}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              ) : null,
            )
          : null}

        {activePoint ? (
          <>
            <line
              x1={activeX}
              x2={activeX}
              y1={0}
              y2={innerHeight}
              stroke={INK}
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.25}
            />
            {activePoint.rate !== null ? (
              <circle
                cx={activeX}
                cy={yScale(activePoint.rate)}
                r={5}
                fill={isUnder(activePoint.rate, target) ? CHART.status.late : CHART.violet}
                stroke={SURFACE}
                strokeWidth={2}
              />
            ) : null}
          </>
        ) : null}

        {hasData ? (
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => onActive(null)}
          />
        ) : null}
      </g>
    </svg>
  );
}

/**
 * The on-time rate over time against a target: the rate line, the target line
 * and, where the rate falls under the target, a tint and a red dot (always with
 * the words "Under target" in the tooltip and table).
 */
export function TargetLine({
  label,
  points,
  target,
  dateLabel,
  height,
  empty,
  width,
}: {
  label: string;
  points: TargetPoint[];
  target: number | null;
  dateLabel: (iso: string) => string;
  height: number;
  empty?: string | null;
  width?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const keys = useChartKeys(points.length, setActive);

  const hasData = points.some((p) => p.rate !== null);

  const activePoint = active !== null ? points[active] : undefined;
  let tooltip: ReactNode = null;
  if (hasData && activePoint && size) {
    const layout = layoutFor(points, target, size);
    const shown = activePoint.rate ?? target ?? 0;
    tooltip = (
      <ChartTooltip
        open
        tone="light"
        left={MARGIN.left + layout.xScale(toDate(activePoint.at))}
        top={MARGIN.top + layout.yScale(shown)}
        title={dateLabel(activePoint.at)}
        rows={tooltipRows(activePoint, target)}
      />
    );
  }

  return (
    <ChartFrame
      label={label}
      height={height}
      width={width}
      empty={hasData ? null : empty}
      focus={hasData ? keys.bind : undefined}
      overlay={tooltip}
      table={{
        caption: label,
        columns: target !== null ? ["Week", "On time", "Target"] : ["Week", "On time"],
        rows: points.map((p) => {
          const rate =
            p.rate === null
              ? "No data"
              : isUnder(p.rate, target)
                ? `${percentAxis(p.rate)} (under target)`
                : percentAxis(p.rate);
          const row = [dateLabel(p.at), rate];
          if (target !== null) row.push(percentAxis(target));
          return row;
        }),
      }}
    >
      {(frameSize) => (
        <Drawing
          size={frameSize}
          points={points}
          target={target}
          dateLabel={dateLabel}
          active={active}
          onActive={setActive}
          onSize={setSize}
        />
      )}
    </ChartFrame>
  );
}
