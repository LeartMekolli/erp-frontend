"use client";

import { useEffect, useId, useState, type PointerEvent, type ReactNode } from "react";
import { LinearGradient } from "@visx/gradient";
import { localPoint } from "@visx/event";
import { scaleLinear, scaleTime } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { bisector } from "d3-array";
import { curveMonotoneX } from "d3-shape";

import { useMediaQuery } from "@/lib/use-media-query";

import { ChartFrame } from "./chart-frame";
import { ChartTooltip, type ChartTooltipRow } from "./chart-tooltip";
import { niceTicks } from "./scale-helpers";
import { CHART } from "./tokens";
import { useChartKeys } from "./use-chart-keys";

export type TrendPoint = {
  /** ISO date, YYYY-MM-DD. */
  at: string;
  value: number | null;
  previous?: number | null;
};

const MARGIN = { left: 46, right: 60, top: 10, bottom: 26 };
const INK = "#16141c";

const TONES = {
  light: {
    line: CHART.violet,
    previous: CHART.gray,
    grid: CHART.grid,
    axis: CHART.axis,
    surface: "#ffffff",
    ink: INK,
    crosshair: INK,
    washColor: "#6d5ae6",
    washOpacity: 0.22,
  },
  dark: {
    line: CHART.dark.line,
    previous: CHART.dark.previous,
    grid: CHART.dark.grid,
    axis: "#9e9bb0",
    surface: CHART.dark.surface,
    ink: "#ffffff",
    crosshair: "#ffffff",
    washColor: "#8f7ef0",
    washOpacity: 0.45,
  },
} as const;

/** A local-time date, so ticks fall on the user's midnights. */
function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

type Size = { width: number; height: number };
type Dot = { x: number; y: number };

/** Both the drawing and the tooltip position come from these, so they can't drift apart. */
function layoutFor(points: TrendPoint[], { width, height }: Size) {
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);
  const hasData = points.some((p) => p.value !== null);
  let max = 0;
  for (const p of points) max = Math.max(max, p.value ?? 0, p.previous ?? 0);
  const ticks = hasData ? niceTicks(max) : [0];
  const top = ticks[ticks.length - 1] ?? 0;
  const yScale = scaleLinear<number>({
    domain: [0, top > 0 ? top : 1],
    range: [innerHeight, 0],
  });
  const dates = points.map((p) => toDate(p.at));
  const xScale = scaleTime<number>({
    domain: dates.length > 0 ? [dates[0], dates[dates.length - 1]] : [new Date(0), new Date(1)],
    range: [0, innerWidth],
  });
  return { innerWidth, innerHeight, hasData, ticks, xScale, yScale };
}

type Layout = ReturnType<typeof layoutFor>;

/** Runs of consecutive non-null values: a null breaks the line, it is never drawn as zero. */
function segmentsOf(points: TrendPoint[], key: "value" | "previous", layout: Layout): Dot[][] {
  const runs: Dot[][] = [];
  let run: Dot[] = [];
  for (const p of points) {
    const v = p[key];
    if (v === null || v === undefined) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push({ x: layout.xScale(toDate(p.at)), y: layout.yScale(v) });
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

function tooltipRows(p: TrendPoint, format: (v: number) => string, tone: "light" | "dark") {
  const colours = TONES[tone];
  const rows: ChartTooltipRow[] = [
    {
      key: colours.line,
      label: "This period",
      value: p.value === null ? "No data" : format(p.value),
      strong: true,
    },
  ];
  if (p.previous !== null && p.previous !== undefined) {
    rows.push({ key: colours.previous, label: "Previous", value: format(p.previous) });
    if (p.value !== null && p.previous > 0) {
      const change = Math.round((p.value / p.previous - 1) * 100);
      rows.push({
        label: "Change",
        value: `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}%`,
      });
    }
  }
  return rows;
}

const DRAW_IN = "ami-trend-draw 1.3s cubic-bezier(.2,.7,.2,1) both";

function Drawing({
  size,
  points,
  tone,
  axis,
  dateLabel,
  endLabel,
  format,
  active,
  onActive,
  onSize,
}: {
  size: Size;
  points: TrendPoint[];
  tone: "light" | "dark";
  axis: (v: number) => string;
  dateLabel: (iso: string) => string;
  endLabel: boolean;
  format: (v: number) => string;
  active: number | null;
  onActive: (index: number | null) => void;
  onSize: (size: Size) => void;
}) {
  const gradientId = useId();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const colours = TONES[tone];
  const { width, height } = size;

  // The tooltip lives outside the drawing and needs the size to place itself.
  useEffect(() => {
    onSize({ width, height });
  }, [width, height, onSize]);

  const layout = layoutFor(points, size);
  const { innerWidth, innerHeight, hasData, ticks, xScale, yScale } = layout;
  const hasPrevious = points.some((p) => p.previous !== null && p.previous !== undefined);
  const current = hasData ? segmentsOf(points, "value", layout) : [];
  const previous = hasData && hasPrevious ? segmentsOf(points, "previous", layout) : [];

  const activePoint = active !== null ? points[active] : undefined;
  const activeX = activePoint ? xScale(toDate(activePoint.at)) : 0;

  let last: Dot | null = null;
  let lastValue: number | null = null;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const v = points[i].value;
    if (v !== null) {
      last = { x: xScale(toDate(points[i].at)), y: yScale(v) };
      lastValue = v;
      break;
    }
  }

  function onPointerMove(e: PointerEvent<SVGRectElement>) {
    const at = localPoint(e);
    if (!at || points.length === 0) return;
    const date = xScale.invert(at.x - MARGIN.left);
    onActive(bisector<TrendPoint, Date>((p) => toDate(p.at)).center(points, date));
  }

  const drawIn = reduceMotion
    ? undefined
    : { strokeDasharray: 1, strokeDashoffset: 0, animation: DRAW_IN };

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {reduceMotion ? null : (
        <style>{"@keyframes ami-trend-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}"}</style>
      )}
      <LinearGradient
        id={gradientId}
        from={colours.washColor}
        to={colours.washColor}
        fromOpacity={colours.washOpacity}
        toOpacity={0}
      />
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {ticks.map((tick) => (
          <g key={tick} transform={`translate(0,${yScale(tick)})`}>
            <line x1={0} x2={innerWidth} stroke={colours.grid} strokeWidth={1} />
            <text
              x={-8}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill={colours.axis}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {axis(tick)}
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
            fill={colours.axis}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {dateLabel(points[i].at)}
          </text>
        ))}

        {previous.map((run, i) => (
          <LinePath<Dot>
            key={`previous-${i}`}
            data={run}
            x={(d) => d.x}
            y={(d) => d.y}
            curve={curveMonotoneX}
            fill="none"
            stroke={colours.previous}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            data-series="previous"
          />
        ))}
        {current.map((run, i) =>
          run.length > 1 ? (
            <g key={`current-${i}`}>
              <AreaClosed<Dot>
                data={run}
                x={(d) => d.x}
                y={(d) => d.y}
                yScale={yScale}
                curve={curveMonotoneX}
                fill={`url(#${gradientId})`}
              />
              <LinePath<Dot>
                data={run}
                x={(d) => d.x}
                y={(d) => d.y}
                curve={curveMonotoneX}
                fill="none"
                stroke={colours.line}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                style={drawIn}
                data-series="current"
              />
            </g>
          ) : (
            // A lone value between two gaps has no line to draw: show it as a dot.
            <circle
              key={`current-${i}`}
              cx={run[0].x}
              cy={run[0].y}
              r={5}
              fill={colours.line}
              stroke={colours.surface}
              strokeWidth={2}
            />
          ),
        )}

        {endLabel && last && lastValue !== null ? (
          <>
            <circle
              data-end-dot
              cx={last.x}
              cy={last.y}
              r={5}
              fill={colours.line}
              stroke={colours.surface}
              strokeWidth={2}
            />
            <text
              x={last.x + 10}
              y={last.y}
              dy="0.32em"
              fontSize={12}
              fontWeight={700}
              fill={colours.ink}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {format(lastValue)}
            </text>
          </>
        ) : null}

        {activePoint ? (
          <>
            <line
              x1={activeX}
              x2={activeX}
              y1={0}
              y2={innerHeight}
              stroke={colours.crosshair}
              strokeWidth={1}
              opacity={0.25}
            />
            {activePoint.previous !== null && activePoint.previous !== undefined ? (
              <circle
                cx={activeX}
                cy={yScale(activePoint.previous)}
                r={4}
                fill={colours.previous}
                stroke={colours.surface}
                strokeWidth={2}
              />
            ) : null}
            {activePoint.value !== null ? (
              <circle
                cx={activeX}
                cy={yScale(activePoint.value)}
                r={5}
                fill={colours.line}
                stroke={colours.surface}
                strokeWidth={2}
              />
            ) : null}
          </>
        ) : null}

        <rect
          x={0}
          y={0}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerLeave={() => onActive(null)}
        />
      </g>
    </svg>
  );
}

/**
 * The main line chart: this period over the previous one, with a crosshair and
 * tooltip for pointer and keyboard. Values are numbers for positioning only;
 * `format` turns them into the text people read.
 */
export function TrendChart({
  label,
  points,
  tone,
  height,
  format,
  axis,
  dateLabel,
  empty,
  endLabel = false,
  width,
}: {
  label: string;
  points: TrendPoint[];
  tone: "light" | "dark";
  height: number;
  format: (v: number) => string;
  axis: (v: number) => string;
  dateLabel: (iso: string) => string;
  empty?: string | null;
  endLabel?: boolean;
  width?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const keys = useChartKeys(points.length, setActive);

  const hasData = points.some((p) => p.value !== null);
  const hasPrevious = points.some((p) => p.previous !== null && p.previous !== undefined);

  const activePoint = active !== null ? points[active] : undefined;
  let tooltip: ReactNode = null;
  if (activePoint && size) {
    const layout = layoutFor(points, size);
    const shown = activePoint.value ?? activePoint.previous ?? 0;
    tooltip = (
      <ChartTooltip
        open
        tone={tone}
        left={MARGIN.left + layout.xScale(toDate(activePoint.at))}
        top={MARGIN.top + layout.yScale(shown)}
        title={dateLabel(activePoint.at)}
        rows={tooltipRows(activePoint, format, tone)}
      />
    );
  }

  return (
    <ChartFrame
      label={label}
      height={height}
      width={width}
      empty={hasData ? null : empty}
      focus={keys.bind}
      overlay={tooltip}
      table={{
        caption: label,
        columns: hasPrevious ? ["Date", "This period", "Previous"] : ["Date", "This period"],
        rows: points.map((p) => {
          const row = [dateLabel(p.at), p.value === null ? "No data" : format(p.value)];
          if (hasPrevious) {
            row.push(p.previous === null || p.previous === undefined ? "No data" : format(p.previous));
          }
          return row;
        }),
      }}
    >
      {(frameSize) => (
        <Drawing
          size={frameSize}
          points={points}
          tone={tone}
          axis={axis}
          dateLabel={dateLabel}
          endLabel={endLabel}
          format={format}
          active={active}
          onActive={setActive}
          onSize={setSize}
        />
      )}
    </ChartFrame>
  );
}
