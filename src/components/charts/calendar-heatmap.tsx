"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { scaleQuantize } from "@visx/scale";
import { utcMonday } from "d3-time";

import { ChartFrame } from "./chart-frame";
import { ChartTooltip } from "./chart-tooltip";
import { CHART } from "./tokens";

export type HeatmapDay = {
  /** Calendar day, YYYY-MM-DD. */
  on: string;
  count: number;
};

const MARGIN = { left: 28, top: 18 };
const GAP = 3;
const LEGEND = 24;
const MIN_CELL = 8;
const MAX_CELL = 14;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROW_LABELS: Record<number, string> = { 0: "Mon", 2: "Wed", 4: "Fri" };
/** The empty step, then four of the counted steps. */
const LEGEND_STEPS = [0, 2, 3, 4, 5].map((i) => CHART.ramp[i]);

/** A calendar day is a UTC midnight, so a reader's time zone never moves it. */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDay(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, delta: number): string {
  return formatDay(new Date(parseDay(iso).getTime() + delta * DAY_MS));
}

/** Weeks since the Monday of the week containing `start`. */
function weekIndex(date: Date, start: Date): number {
  return Math.round((utcMonday.floor(date).getTime() - utcMonday.floor(start).getTime()) / WEEK_MS);
}

type Cell = { on: string; col: number; row: number };

/** Both the drawing and the tooltip position come from these, so they can't drift apart. */
function layoutFor(year: number, width: number | null) {
  const first = new Date(Date.UTC(year, 0, 1));
  const last = new Date(Date.UTC(year, 11, 31));
  const weeks = weekIndex(last, first) + 1;
  const cell =
    width === null
      ? MAX_CELL
      : Math.min(
          Math.max(Math.floor((width - MARGIN.left) / weeks) - GAP, MIN_CELL),
          MAX_CELL,
        );
  const step = cell + GAP;
  const dayCount = Math.round((last.getTime() - first.getTime()) / DAY_MS) + 1;
  const cells: Cell[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const date = new Date(first.getTime() + i * DAY_MS);
    cells.push({
      on: formatDay(date),
      col: weekIndex(date, first),
      row: (date.getUTCDay() + 6) % 7,
    });
  }
  const months = MONTHS.map((name, m) => ({
    name,
    col: weekIndex(new Date(Date.UTC(year, m, 1)), first),
  }));
  return {
    cell,
    step,
    weeks,
    cells,
    months,
    height: MARGIN.top + 7 * step + LEGEND,
    x: (col: number) => MARGIN.left + col * step,
    y: (row: number) => MARGIN.top + row * step,
  };
}

function Drawing({
  year,
  width,
  counts,
  today,
  interactive,
  active,
  onActive,
  onSize,
}: {
  year: number;
  width: number;
  counts: Map<string, number>;
  today: string;
  interactive: boolean;
  active: string | null;
  onActive: (on: string | null) => void;
  onSize: (width: number) => void;
}) {
  // The frame height and the tooltip follow the measured width.
  useEffect(() => {
    onSize(width);
  }, [width, onSize]);

  const layout = layoutFor(year, width);
  const { cell, cells, months, x, y } = layout;

  let max = 0;
  for (const count of counts.values()) max = Math.max(max, count);
  const ramp = CHART.ramp.slice(1);
  // With a single order a day's whole range collapses: show it in the darkest step.
  const colour = scaleQuantize<string>({
    domain: [1, Math.max(max, 2)],
    range: max <= 1 ? [ramp[ramp.length - 1]] : ramp,
  });

  const activeCell = active !== null ? cells.find((c) => c.on === active) : undefined;
  // Only when today falls in this year: the ring shows where the year stands.
  const todayCell = cells.find((c) => c.on === today);
  const legendY = MARGIN.top + 7 * layout.step + 8;

  return (
    <svg width={width} height={layout.height} style={{ display: "block" }}>
      {months.map((month) => (
        <text
          key={month.name}
          x={x(month.col)}
          y={MARGIN.top - 6}
          fontSize={11}
          fill={CHART.axis}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {month.name}
        </text>
      ))}
      {Object.entries(ROW_LABELS).map(([row, text]) => (
        <text
          key={text}
          x={0}
          y={y(Number(row)) + cell / 2}
          dy="0.32em"
          fontSize={11}
          fill={CHART.axis}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {text}
        </text>
      ))}

      {cells.map((c) => {
        const future = c.on > today;
        const count = counts.get(c.on) ?? 0;
        const fill = future ? CHART.future : count <= 0 ? CHART.ramp[0] : colour(count);
        return (
          <rect
            key={c.on}
            data-day={c.on}
            data-future={future ? "" : undefined}
            x={x(c.col)}
            y={y(c.row)}
            width={cell}
            height={cell}
            rx={3}
            fill={fill}
          />
        );
      })}

      {todayCell ? (
        <rect
          data-today={todayCell.on}
          x={x(todayCell.col)}
          y={y(todayCell.row)}
          width={cell}
          height={cell}
          rx={3}
          fill="none"
          stroke={CHART.axis}
          strokeWidth={1.5}
          pointerEvents="none"
        />
      ) : null}

      {activeCell ? (
        <rect
          data-active={activeCell.on}
          x={x(activeCell.col)}
          y={y(activeCell.row)}
          width={cell}
          height={cell}
          rx={3}
          fill="none"
          stroke={CHART.ink}
          strokeWidth={1.5}
          pointerEvents="none"
        />
      ) : null}

      {interactive ? (
        <g onPointerLeave={() => onActive(null)}>
          {cells
            .filter((c) => c.on <= today)
            .map((c) => (
              <rect
                key={c.on}
                data-hit={c.on}
                x={x(c.col)}
                y={y(c.row)}
                width={cell}
                height={cell}
                fill="transparent"
                onPointerMove={() => onActive(c.on)}
              />
            ))}
        </g>
      ) : null}

      <g aria-hidden="true" transform={`translate(${MARGIN.left},${legendY})`}>
        <text y={9} fontSize={11} fill={CHART.axis}>
          Fewer
        </text>
        {LEGEND_STEPS.map((step, i) => (
          <rect key={i} x={36 + i * 14} y={0} width={10} height={10} rx={3} fill={step} />
        ))}
        <text x={36 + LEGEND_STEPS.length * 14 + 4} y={9} fontSize={11} fill={CHART.axis}>
          More
        </text>
      </g>
    </svg>
  );
}

/**
 * A year of orders by day, one cell per day in ISO-week columns. Keys step by
 * day (left, right) and by week (up, down); days after `today` are drawn but
 * never selectable.
 */
export function CalendarHeatmap({
  label,
  year,
  days,
  today,
  dateLabel,
  empty,
  width,
}: {
  label: string;
  year: number;
  days: HeatmapDay[];
  today: string;
  dateLabel: (iso: string) => string;
  empty?: string | null;
  width?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);

  const firstDay = `${String(year).padStart(4, "0")}-01-01`;
  const lastDay = `${String(year).padStart(4, "0")}-12-31`;
  const lastSelectable = today < lastDay ? today : lastDay;

  const inYear = days
    .filter((d) => d.on >= firstDay && d.on <= lastDay)
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const counts = new Map(inYear.map((d) => [d.on, d.count]));
  const hasData = inYear.length > 0;
  const canSelect = hasData && lastSelectable >= firstDay;

  function clamp(on: string): string {
    return on < firstDay ? firstDay : on > lastSelectable ? lastSelectable : on;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!canSelect) return;
    let next: string;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown": {
        const delta = e.key === "ArrowRight" ? 1 : 7;
        next = active === null ? firstDay : clamp(addDays(active, delta));
        break;
      }
      case "ArrowLeft":
      case "ArrowUp": {
        const delta = e.key === "ArrowLeft" ? -1 : -7;
        next = active === null ? lastSelectable : clamp(addDays(active, delta));
        break;
      }
      case "Home":
        next = firstDay;
        break;
      case "End":
        next = lastSelectable;
        break;
      case "Escape":
        setActive(null);
        e.preventDefault();
        return;
      default:
        return;
    }
    setActive(next);
    e.preventDefault();
  }

  function onBlur() {
    if (active !== null) setActive(null);
  }

  const layout = layoutFor(year, width ?? measured);
  const activeCell = active !== null ? layout.cells.find((c) => c.on === active) : undefined;
  let tooltip: ReactNode = null;
  if (canSelect && activeCell && activeCell.on <= today) {
    tooltip = (
      <ChartTooltip
        open
        tone="light"
        left={layout.x(activeCell.col) + layout.cell / 2}
        top={layout.y(activeCell.row)}
        title={dateLabel(activeCell.on)}
        rows={[
          {
            key: CHART.violet,
            label: "Orders",
            value: String(counts.get(activeCell.on) ?? 0),
            strong: true,
          },
        ]}
      />
    );
  }

  return (
    <ChartFrame
      label={label}
      height={layout.height}
      width={width}
      empty={hasData ? null : empty}
      focus={canSelect ? { tabIndex: 0, onKeyDown, onBlur } : undefined}
      overlay={tooltip}
      table={{
        caption: label,
        columns: ["Date", "Orders"],
        rows: inYear.map((d) => [dateLabel(d.on), d.count]),
      }}
    >
      {(frameSize) => (
        <Drawing
          year={year}
          width={frameSize.width}
          counts={counts}
          today={today}
          interactive={canSelect}
          active={active}
          onActive={setActive}
          onSize={setMeasured}
        />
      )}
    </ChartFrame>
  );
}
