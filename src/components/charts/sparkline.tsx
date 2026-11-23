"use client";

import { useId } from "react";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { curveMonotoneX } from "d3-shape";

import { CHART } from "./tokens";

const HEIGHT = 40;
/** Room for the end dot and its ring so they aren't cut off at the edge. */
const PAD = 6;

type Dot = { x: number; y: number; defined: boolean };

function Drawing({ values, width }: { values: (number | null)[]; width: number }) {
  const id = useId();
  const count = values.length;
  const present = values.filter((v): v is number => v !== null);
  const min = present.length > 0 ? Math.min(...present) : 0;
  const max = present.length > 0 ? Math.max(...present) : 0;
  // All values equal: a flat line in the middle rather than a divide by zero.
  const yScale = scaleLinear<number>({
    domain: min === max ? [min - 1, max + 1] : [min, max],
    range: [HEIGHT - PAD, PAD],
  });
  const xScale = scaleLinear<number>({
    domain: [0, Math.max(count - 1, 1)],
    range: [PAD, Math.max(width - PAD, PAD)],
  });
  const dots: Dot[] = values.map((v, i) => ({
    x: xScale(i),
    y: v === null ? 0 : yScale(v),
    defined: v !== null,
  }));

  // The last segment (second-to-last to last point) is violet, every other one gray.
  // One smooth curve is drawn twice and clipped, so the join stays smooth.
  const split = count >= 2 ? xScale(count - 2) : xScale(0);
  const lastDot = dots[count - 1];
  const restClip = `${id}-rest`;
  const lastClip = `${id}-last`;
  const common = {
    data: dots,
    x: (d: Dot) => d.x,
    y: (d: Dot) => d.y,
    defined: (d: Dot) => d.defined,
    curve: curveMonotoneX,
    fill: "none",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg width={width} height={HEIGHT} style={{ display: "block" }}>
      <defs>
        <clipPath id={restClip}>
          <rect x={0} y={0} width={split} height={HEIGHT} />
        </clipPath>
        <clipPath id={lastClip}>
          <rect x={split} y={0} width={Math.max(width - split, 0)} height={HEIGHT} />
        </clipPath>
      </defs>
      <LinePath<Dot>
        {...common}
        stroke={CHART.gray}
        clipPath={`url(#${restClip})`}
        data-segment="rest"
      />
      <LinePath<Dot>
        {...common}
        stroke={CHART.violet}
        clipPath={`url(#${lastClip})`}
        data-segment="last"
      />
      {lastDot?.defined ? (
        <circle
          cx={lastDot.x}
          cy={lastDot.y}
          r={4}
          fill={CHART.violet}
          stroke="#ffffff"
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}

/**
 * A small trend line for a KPI tile. It has no table or tooltip: the tile states
 * the figure in text, so this only carries the shape. Pass `width` to skip
 * measuring (tests: jsdom has no layout).
 */
export function Sparkline({
  values,
  label,
  width,
}: {
  values: (number | null)[];
  label: string;
  width?: number;
}) {
  return (
    <div role="img" aria-label={label} style={{ height: HEIGHT }}>
      {width !== undefined ? (
        <Drawing values={values} width={width} />
      ) : (
        <ParentSize debounceTime={50} style={{ height: HEIGHT }}>
          {({ width: measured }) => (measured > 0 ? <Drawing values={values} width={measured} /> : null)}
        </ParentSize>
      )}
    </div>
  );
}
