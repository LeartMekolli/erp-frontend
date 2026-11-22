"use client";

import { scaleLinear } from "@visx/scale";

import { ChartFrame } from "./chart-frame";
import { CHART } from "./tokens";

export type DumbbellDatum = { key: string; label: string; before: number | null; now: number };

const ROW = 28;
const LABEL_WIDTH = 110;
const VALUE_WIDTH = 64;
const GAP = 8;
const PAD = 8;
const SURFACE = "#ffffff";

/**
 * Before and now for each row on one shared scale. Worse (now above before) is
 * shown in the late colour with a ▲, so it never relies on colour alone.
 */
export function Dumbbell({
  label,
  data,
  unit,
  width,
}: {
  label: string;
  data: DumbbellDatum[];
  unit: string;
  width?: number;
}) {
  let max = 0;
  for (const d of data) max = Math.max(max, d.now, d.before ?? 0);
  const text = (v: number) => `${v}${unit}`;

  return (
    <ChartFrame
      label={label}
      height={data.length * ROW}
      width={width}
      table={{
        caption: label,
        columns: ["Step", "Before", "Now"],
        rows: data.map((d) => [d.label, d.before === null ? "No data" : text(d.before), text(d.now)]),
      }}
    >
      {({ width: frameWidth }) => {
        const trackWidth = Math.max(frameWidth - LABEL_WIDTH - VALUE_WIDTH - GAP * 2, 0);
        const x = scaleLinear<number>({
          domain: [0, max > 0 ? max : 1],
          range: [PAD, Math.max(trackWidth - PAD, PAD)],
        });
        return (
          <div style={{ width: frameWidth }}>
            {data.map((d) => {
              const worse = d.before !== null && d.now > d.before;
              return (
                <div
                  key={d.key}
                  data-row={d.key}
                  className="flex items-center overflow-hidden"
                  style={{ height: ROW, columnGap: GAP }}
                >
                  <span
                    className="text-ink shrink-0 text-[13px] leading-[14px]"
                    style={{ width: LABEL_WIDTH }}
                  >
                    {d.label}
                  </span>
                  <svg width={trackWidth} height={ROW} style={{ display: "block", flexShrink: 0 }}>
                    {d.before !== null ? (
                      <>
                        <line
                          x1={x(d.before)}
                          x2={x(d.now)}
                          y1={ROW / 2}
                          y2={ROW / 2}
                          stroke={CHART.gray}
                          strokeWidth={2}
                        />
                        <circle data-dot cx={x(d.before)} cy={ROW / 2} r={4.5} fill={CHART.gray} />
                      </>
                    ) : null}
                    <circle
                      data-dot
                      cx={x(d.now)}
                      cy={ROW / 2}
                      r={5}
                      fill={worse ? CHART.status.late : CHART.violet}
                      stroke={SURFACE}
                      strokeWidth={2}
                    />
                  </svg>
                  <span
                    className={`shrink-0 text-right text-[13px] font-semibold ${worse ? "text-late-ink" : "text-ink"}`}
                    style={{ width: VALUE_WIDTH, fontVariantNumeric: "tabular-nums" }}
                  >
                    {worse ? `${text(d.now)} ▲` : text(d.now)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      }}
    </ChartFrame>
  );
}
