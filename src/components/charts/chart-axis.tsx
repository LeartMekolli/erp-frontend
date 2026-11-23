import { CHART } from "./tokens";

/**
 * Horizontal gridlines with their value labels on the left, one group per tick.
 * Drawn inside the plot group (the margin is already applied by the caller).
 */
export function ChartAxisY({
  ticks,
  yScale,
  format,
  innerWidth,
  grid = CHART.grid,
  text = CHART.axis,
}: {
  ticks: number[];
  yScale: (value: number) => number;
  format: (value: number) => string;
  innerWidth: number;
  grid?: string;
  text?: string;
}) {
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick} transform={`translate(0,${yScale(tick)})`}>
          <line x1={0} x2={innerWidth} stroke={grid} strokeWidth={1} />
          <text
            x={-8}
            dy="0.32em"
            textAnchor="end"
            fontSize={11}
            fill={text}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {format(tick)}
          </text>
        </g>
      ))}
    </>
  );
}
