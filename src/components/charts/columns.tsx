"use client";

import { useEffect, useState, type ReactNode } from "react";
import { scaleBand, scaleLinear } from "@visx/scale";

import { ChartFrame } from "./chart-frame";
import { ChartTooltip, type ChartTooltipRow } from "./chart-tooltip";
import { niceTicks } from "./scale-helpers";
import { CHART } from "./tokens";
import { useChartKeys } from "./use-chart-keys";

export type ColumnsDatum = { key: string; label: string; values: number[] };
export type ColumnsSeries = { name: string; color: string };

const MARGIN = { left: 40, right: 8, top: 22, bottom: 24 };
const INK = "#16141c";
const MAX_COLUMN = 24;
const GAP = 2;
const RADIUS = 4;

type Size = { width: number; height: number };

function totalOf(d: ColumnsDatum): number {
  let sum = 0;
  for (const v of d.values) sum += v;
  return sum;
}

/** Both the drawing and the tooltip position come from these, so they can't drift apart. */
function layoutFor(data: ColumnsDatum[], { width, height }: Size) {
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);
  let max = 0;
  for (const d of data) max = Math.max(max, totalOf(d));
  const hasData = max > 0;
  const ticks = hasData ? niceTicks(max) : [0, 1];
  const top = ticks[ticks.length - 1] ?? 1;
  const yScale = scaleLinear<number>({
    domain: [0, top > 0 ? top : 1],
    range: [innerHeight, 0],
  });
  const xScale = scaleBand<string>({
    domain: data.map((d) => d.key),
    range: [0, innerWidth],
    padding: 0.35,
  });
  return { innerWidth, innerHeight, hasData, ticks, xScale, yScale };
}

/** A column with a rounded top and a square base; a plain rectangle when `round` is off. */
function columnPath(x: number, w: number, yTop: number, yBottom: number, round: boolean): string {
  const r = round ? Math.min(RADIUS, w / 2, yBottom - yTop) : 0;
  if (r <= 0) return `M${x},${yBottom}V${yTop}H${x + w}V${yBottom}Z`;
  return (
    `M${x},${yBottom}V${yTop + r}A${r},${r} 0 0 1 ${x + r},${yTop}` +
    `H${x + w - r}A${r},${r} 0 0 1 ${x + w},${yTop + r}V${yBottom}Z`
  );
}

function Drawing({
  size,
  data,
  series,
  highlight,
  format,
  axis,
  active,
  onActive,
  onSize,
}: {
  size: Size;
  data: ColumnsDatum[];
  series: ColumnsSeries[];
  highlight?: number;
  format: (v: number) => string;
  axis: (v: number) => string;
  active: number | null;
  onActive: (index: number | null) => void;
  onSize: (size: Size) => void;
}) {
  const { width, height } = size;

  // The tooltip lives outside the drawing and needs the size to place itself.
  useEffect(() => {
    onSize({ width, height });
  }, [width, height, onSize]);

  const { innerWidth, innerHeight, ticks, xScale, yScale } = layoutFor(data, size);
  const single = series.length === 1;
  const step = xScale.step();
  const bandwidth = xScale.bandwidth();
  const columnWidth = Math.min(MAX_COLUMN, bandwidth);
  const labelEvery = step > 0 && step < 28 ? Math.ceil(28 / step) : 1;

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
              {axis(tick)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const bandX = xScale(d.key) ?? 0;
          const x = bandX + (bandwidth - columnWidth) / 2;
          const centre = bandX + bandwidth / 2;
          const total = totalOf(d);

          // Bottom to top; a zero part draws nothing and a gap separates the rest.
          let rest = d.values.length;
          while (rest > 0 && !(d.values[rest - 1] > 0)) rest -= 1;
          const topPart = rest - 1;
          let cumulative = 0;
          let drawn = 0;
          const parts: ReactNode[] = [];
          d.values.forEach((value, s) => {
            if (!(value > 0)) return;
            const yBottom = yScale(cumulative);
            const yTop = yScale(cumulative + value);
            cumulative += value;
            const inset = drawn > 0 ? GAP : 0;
            const bottom = Math.min(yBottom - inset, yBottom);
            const topEdge = Math.min(yTop, bottom - 1);
            drawn += 1;
            const colour = single
              ? highlight === undefined
                ? series[0].color
                : i === highlight
                  ? CHART.violet
                  : CHART.lilac2
              : (series[s]?.color ?? CHART.gray);
            parts.push(
              <path
                key={s}
                d={columnPath(x, columnWidth, topEdge, bottom, s === topPart)}
                fill={colour}
                {...(single ? { "data-column": "" } : { "data-part": "" })}
              />,
            );
          });

          return (
            <g key={d.key}>
              {parts}
              {i === highlight && total > 0 ? (
                <text
                  x={centre}
                  y={yScale(total) - 6}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill={INK}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {format(total)}
                </text>
              ) : null}
              {i % labelEvery === 0 ? (
                <text
                  x={centre}
                  y={innerHeight + 17}
                  textAnchor="middle"
                  fontSize={11}
                  fill={CHART.axis}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}

        <g onPointerLeave={() => onActive(null)}>
          {data.map((d, i) => (
            <rect
              key={d.key}
              x={(xScale(d.key) ?? 0) - (step - bandwidth) / 2}
              y={0}
              width={step}
              height={innerHeight}
              fill={i === active ? INK : "transparent"}
              fillOpacity={i === active ? 0.04 : undefined}
              onPointerEnter={() => onActive(i)}
              onPointerMove={() => onActive(i)}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

/**
 * Columns, or stacked columns when there are several series (series 0 at the
 * bottom). One value label, on the highlighted column or stack; the rest is in
 * the tooltip and the hidden table.
 */
export function Columns({
  label,
  data,
  series,
  highlight,
  height,
  format,
  axis,
  empty,
  width,
}: {
  label: string;
  data: ColumnsDatum[];
  series: ColumnsSeries[];
  highlight?: number;
  height: number;
  format: (v: number) => string;
  axis: (v: number) => string;
  empty?: string | null;
  width?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const keys = useChartKeys(data.length, setActive);

  const stacked = series.length > 1;
  const hasData = data.some((d) => totalOf(d) > 0);

  const activeDatum = active !== null ? data[active] : undefined;
  let tooltip: ReactNode = null;
  if (activeDatum && size) {
    const layout = layoutFor(data, size);
    const rows: ChartTooltipRow[] = series.map((s, i) => ({
      key: s.color,
      label: s.name,
      value: format(activeDatum.values[i] ?? 0),
      strong: !stacked,
    }));
    if (stacked) rows.push({ label: "Total", value: format(totalOf(activeDatum)), strong: true });
    tooltip = (
      <ChartTooltip
        open
        tone="light"
        left={MARGIN.left + (layout.xScale(activeDatum.key) ?? 0) + layout.xScale.bandwidth() / 2}
        top={MARGIN.top + layout.yScale(totalOf(activeDatum))}
        title={activeDatum.label}
        rows={rows}
      />
    );
  }

  return (
    <div>
      <ChartFrame
        label={label}
        height={height}
        width={width}
        empty={hasData ? null : empty}
        focus={hasData ? keys.bind : undefined}
        overlay={tooltip}
        table={{
          caption: label,
          columns: ["Period", ...series.map((s) => s.name), ...(stacked ? ["Total"] : [])],
          rows: data.map((d) => [
            d.label,
            ...series.map((_, i) => format(d.values[i] ?? 0)),
            ...(stacked ? [format(totalOf(d))] : []),
          ]),
        }}
      >
        {(frameSize) => (
          <Drawing
            size={frameSize}
            data={data}
            series={series}
            highlight={highlight}
            format={format}
            axis={axis}
            active={active}
            onActive={setActive}
            onSize={setSize}
          />
        )}
      </ChartFrame>
      {stacked ? (
        <ul className="text-ink-2 m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 rounded-[3px]"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
