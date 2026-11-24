"use client";

import { useEffect, useState, type PointerEvent, type ReactNode } from "react";
import { localPoint } from "@visx/event";
import { scaleLinear, scaleTime } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { bisector } from "d3-array";
import { curveLinear, curveStepAfter } from "d3-shape";

import { useMediaQuery } from "@/lib/use-media-query";

import { ChartAxisY } from "./chart-axis";
import { ChartFrame } from "./chart-frame";
import { ChartTooltip, type ChartTooltipRow } from "./chart-tooltip";
import { labelIndexes, niceTicks, runsOf, toDate, type ChartDot as Dot, type ChartSize as Size } from "./scale-helpers";
import { CHART } from "./tokens";
import { useChartKeys } from "./use-chart-keys";

export type CapacityPoint = {
  /** ISO date, YYYY-MM-DD. */
  at: string;
  /** Pieces waiting at the step that day. */
  load: number;
  /** The capacity as the partner set it; null or 0 draws no line at that point. */
  capacity: number | null;
  /** The unit the capacity was set in that day, for `capacityWords`; a step can change it. */
  period?: "day" | "week";
};

/** A capacity in words, in the day's unit: "45 a day", "200 a week". */
type CapacityWords = (capacity: number, period?: CapacityPoint["period"]) => string;

const MARGIN = { left: 40, right: 12, top: 22, bottom: 26 };
const OVER = "▲ Over your capacity";
const DRAW_IN = "ami-capacity-draw 1.3s cubic-bezier(.2,.7,.2,1) both";

const TONES = {
  light: {
    load: CHART.violet,
    capacity: "#8d8a9c",
    tint: 0.35,
    grid: CHART.grid,
    axis: CHART.axis,
    surface: CHART.surface,
    crosshair: CHART.ink,
  },
  dark: {
    load: CHART.dark.line,
    capacity: "#9e9bb0",
    tint: 0.55,
    grid: CHART.dark.grid,
    axis: "#9e9bb0",
    surface: CHART.dark.surface,
    crosshair: "#ffffff",
  },
} as const;

const hasCapacity = (p: CapacityPoint): p is CapacityPoint & { capacity: number } => p.capacity !== null && p.capacity > 0;
const isOver = (p: CapacityPoint) => hasCapacity(p) && p.load > p.capacity;

/** Both the drawing and the tooltip position come from these, so they can't drift apart. */
function layoutFor(points: CapacityPoint[], { width, height }: Size) {
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);
  let max = 0;
  for (const p of points) max = Math.max(max, p.load, p.capacity ?? 0);
  const ticks = niceTicks(max);
  // With nothing to show, a 0 to 1 scale draws bare axes instead of dividing by zero.
  const top = Math.max(ticks[ticks.length - 1] ?? 0, 1);
  const yScale = scaleLinear<number>({ domain: [0, top], range: [innerHeight, 0] });
  const dates = points.map((p) => toDate(p.at));
  const xScale = scaleTime<number>({
    domain: dates.length > 1 ? [dates[0]!, dates[dates.length - 1]!] : dates.length === 1 ? [dates[0]!, new Date(dates[0]!.getTime() + 1)] : [new Date(0), new Date(1)],
    range: [0, innerWidth],
  });
  return { innerWidth, innerHeight, ticks, xScale, yScale };
}

type Layout = ReturnType<typeof layoutFor>;

/**
 * The capacity's first label, and one wherever it changes: "Capacity 45 a day", "raised to 50 on 5 Nov",
 * or "changed to 200 a week on 5 Nov" when the unit changed, as a number alone would compare a day with a week.
 */
function capacityLabels(points: CapacityPoint[], capacityWords: CapacityWords, dateLabel: (iso: string) => string) {
  const labels: { index: number; text: string }[] = [];
  let last: CapacityPoint | null = null;
  points.forEach((p, index) => {
    if (!hasCapacity(p)) {
      last = null;
      return;
    }
    if (last === null || last.capacity === null) labels.push({ index, text: `Capacity ${capacityWords(p.capacity, p.period)}` });
    else if (p.period !== last.period) labels.push({ index, text: `changed to ${capacityWords(p.capacity, p.period)} on ${dateLabel(p.at)}` });
    else if (p.capacity !== last.capacity)
      labels.push({ index, text: `${p.capacity > last.capacity ? "raised" : "lowered"} to ${p.capacity} on ${dateLabel(p.at)}` });
    last = p;
  });
  return labels;
}

/**
 * Where the load is over the capacity, one shape per day to the next: the capacity holds from a day to
 * the next (a step, as drawn) and the load runs straight between them, so the tint's edges are the lines'.
 */
function tintsOf(points: CapacityPoint[], x: (p: CapacityPoint) => number, y: (value: number) => number): string[] {
  const tints: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const from = points[i]!;
    const to = points[i + 1]!;
    if (!hasCapacity(from) || !hasCapacity(to)) continue;
    const c = from.capacity;
    if (from.load <= c && to.load <= c) continue;
    const [x0, x1] = [x(from), x(to)];
    const crossAt = x0 + ((c - from.load) / (to.load - from.load)) * (x1 - x0);
    const corners =
      from.load > c && to.load > c
        ? [[x0, c], [x0, from.load], [x1, to.load], [x1, c]]
        : from.load > c
          ? [[x0, c], [x0, from.load], [crossAt, c]]
          : [[crossAt, c], [x1, to.load], [x1, c]];
    tints.push(`M${corners.map(([px, value]) => `${px},${y(value!)}`).join("L")}Z`);
  }
  return tints;
}

function tooltipRows(p: CapacityPoint, capacityWords: CapacityWords, tone: "light" | "dark"): ChartTooltipRow[] {
  const rows: ChartTooltipRow[] = [
    { key: TONES[tone].load, label: "Waiting", value: String(p.load), strong: true },
    { key: TONES[tone].capacity, label: "Capacity", value: hasCapacity(p) ? capacityWords(p.capacity, p.period) : "None set" },
  ];
  if (isOver(p)) rows.push({ label: OVER, value: "" });
  return rows;
}

function Drawing({
  size,
  points,
  tone,
  capacityWords,
  dateLabel,
  active,
  onActive,
  onSize,
}: {
  size: Size;
  points: CapacityPoint[];
  tone: "light" | "dark";
  capacityWords: CapacityWords;
  dateLabel: (iso: string) => string;
  active: number | null;
  onActive: (index: number | null) => void;
  onSize: (size: Size) => void;
}) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const colours = TONES[tone];
  const { width, height } = size;

  // The tooltip lives outside the drawing and needs the size to place itself.
  useEffect(() => {
    onSize({ width, height });
  }, [width, height, onSize]);

  const layout: Layout = layoutFor(points, size);
  const { innerWidth, innerHeight, ticks, xScale, yScale } = layout;
  const x = (p: CapacityPoint) => xScale(toDate(p.at));
  const capacityRuns = runsOf(points, (p) => (hasCapacity(p) ? { x: x(p), y: yScale(p.capacity) } : null));
  const labels = capacityLabels(points, capacityWords, dateLabel);
  const tints = tintsOf(points, x, yScale);
  const drawIn = reduceMotion ? undefined : { strokeDasharray: 1, strokeDashoffset: 0, animation: DRAW_IN };

  const activePoint = active !== null ? points[active] : undefined;

  function onPointerMove(e: PointerEvent<SVGRectElement>) {
    const at = localPoint(e);
    if (!at || points.length === 0) return;
    const date = xScale.invert(at.x - MARGIN.left);
    onActive(bisector<CapacityPoint, Date>((p) => toDate(p.at)).center(points, date));
  }

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {reduceMotion ? null : <style>{"@keyframes ami-capacity-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}"}</style>}
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        <ChartAxisY ticks={ticks} yScale={yScale} format={String} innerWidth={innerWidth} grid={colours.grid} text={colours.axis} />
        {labelIndexes(points.length).map((i) => (
          <text
            key={i}
            x={x(points[i]!)}
            y={innerHeight + 18}
            textAnchor="middle"
            fontSize={11}
            fill={colours.axis}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {dateLabel(points[i]!.at)}
          </text>
        ))}

        {tints.map((d) => (
          <path key={d} data-tint="" d={d} fill={CHART.status.collect} fillOpacity={colours.tint} />
        ))}

        {capacityRuns.map((run, i) =>
          run.length > 1 ? (
            <LinePath<Dot>
              key={`capacity-${i}`}
              data={run}
              x={(d) => d.x}
              y={(d) => d.y}
              curve={curveStepAfter}
              fill="none"
              stroke={colours.capacity}
              strokeWidth={2}
              data-series="capacity"
            />
          ) : null,
        )}

        {labels.map(({ index, text }) => {
          const p = points[index]!;
          const at = x(p);
          return (
            <text
              key={`${index}-${text}`}
              x={at}
              y={yScale(p.capacity ?? 0) - 6}
              textAnchor={at > innerWidth * 0.7 ? "end" : "start"}
              fontSize={11}
              fontWeight={600}
              fill={colours.capacity}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {text}
            </text>
          );
        })}

        {points.length > 1 ? (
          <LinePath<CapacityPoint>
            data={points}
            x={x}
            y={(p) => yScale(p.load)}
            curve={curveLinear}
            fill="none"
            stroke={colours.load}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={drawIn}
            data-series="load"
          />
        ) : points.length === 1 ? (
          <circle cx={x(points[0]!)} cy={yScale(points[0]!.load)} r={4} fill={colours.load} />
        ) : null}

        {points.map((p) =>
          isOver(p) ? (
            <circle key={p.at} data-over="" cx={x(p)} cy={yScale(p.load)} r={4} fill={CHART.status.collect} stroke={colours.surface} strokeWidth={2} />
          ) : null,
        )}

        {activePoint ? (
          <>
            <line
              x1={x(activePoint)}
              x2={x(activePoint)}
              y1={0}
              y2={innerHeight}
              stroke={colours.crosshair}
              strokeWidth={1}
              opacity={0.25}
            />
            <circle cx={x(activePoint)} cy={yScale(activePoint.load)} r={5} fill={colours.load} stroke={colours.surface} strokeWidth={2} />
          </>
        ) : null}

        {points.length > 0 ? (
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
 * Pieces waiting at a step each day against the capacity the partner set, per day or per week as
 * they set it (`capacityWords` says which; AMI never converts one into the other). Where the load
 * is over the capacity, an amber tint and dot, always with the words "Over your capacity" in the
 * tooltip and the table.
 */
export function CapacityChart({
  label,
  points,
  capacityWords,
  dateLabel,
  height,
  tone,
  empty,
  width,
}: {
  label: string;
  points: CapacityPoint[];
  capacityWords: CapacityWords;
  dateLabel: (iso: string) => string;
  height: number;
  tone: "light" | "dark";
  empty?: string | null;
  width?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const keys = useChartKeys(points.length, setActive);
  const hasData = points.length > 0;

  const activePoint = active !== null ? points[active] : undefined;
  let tooltip: ReactNode = null;
  if (activePoint && size) {
    const layout = layoutFor(points, size);
    tooltip = (
      <ChartTooltip
        open
        tone={tone}
        left={MARGIN.left + layout.xScale(toDate(activePoint.at))}
        top={MARGIN.top + layout.yScale(activePoint.load)}
        title={dateLabel(activePoint.at)}
        rows={tooltipRows(activePoint, capacityWords, tone)}
      />
    );
  }

  return (
    <ChartFrame
      label={label}
      height={height}
      width={width}
      tone={tone}
      empty={hasData ? null : empty}
      focus={hasData ? keys.bind : undefined}
      overlay={tooltip}
      table={{
        caption: label,
        columns: ["Day", "Waiting", "Capacity"],
        rows: points.map((p) => [
          dateLabel(p.at),
          isOver(p) ? `${p.load} (${OVER})` : String(p.load),
          hasCapacity(p) ? capacityWords(p.capacity, p.period) : "None set",
        ]),
      }}
    >
      {(frameSize) => (
        <Drawing
          size={frameSize}
          points={points}
          tone={tone}
          capacityWords={capacityWords}
          dateLabel={dateLabel}
          active={active}
          onActive={setActive}
          onSize={setSize}
        />
      )}
    </ChartFrame>
  );
}
