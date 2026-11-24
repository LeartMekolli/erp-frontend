import { cn } from "cn";

import { CHART } from "./tokens";

const SIZE = 46;
const STROKE = 4;
/** Under this share of the offer's time left, the ring and its words turn late. */
const HURRY = 0.25;

/**
 * How much of an offer's time is left, as a ring around the time in words ("5h"). The words always
 * carry the meaning; the ring only adds the picture, so it's hidden from screen readers.
 */
export function CountdownRing({ left, text }: { left: number; text: string }) {
  const share = Math.min(Math.max(left, 0), 1);
  const hurry = share < HURRY;
  const radius = (SIZE - STROKE) / 2;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} aria-hidden="true" className="absolute inset-0">
        {/* White, not lilac: the ring sits on the lilac Offers tile, where a lilac track would vanish. */}
        <circle data-track="" cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none" stroke={CHART.surface} strokeWidth={STROKE} />
        {share > 0 ? (
          <circle
            data-arc=""
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke={hurry ? CHART.status.late : CHART.violet}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${share} 1`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ) : null}
      </svg>
      <span className={cn("relative text-[11px] font-semibold tabular-nums", hurry ? "text-late-ink" : "text-ink")}>{text}</span>
    </span>
  );
}
