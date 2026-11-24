import { CHART } from "./tokens";

const STROKE = 10;

/**
 * A score out of 5 as a ring: the violet arc is the score, the lilac track the rest, with the
 * score in the middle. Without a score (a new workshop) the ring is empty and reads "New".
 */
export function ScoreRing({ score, size = 112 }: { score: number | null; size?: number }) {
  const radius = (size - STROKE) / 2;
  const share = score === null ? 0 : Math.min(Math.max(score / 5, 0), 1);
  return (
    <div
      role="img"
      aria-label={score === null ? "No score yet" : `Score ${score.toFixed(1)} out of 5`}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} aria-hidden="true" className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={CHART.lilac} strokeWidth={STROKE} />
        {score === null ? null : (
          <circle
            data-arc=""
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={CHART.violet}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${share} 1`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="relative flex flex-col items-center leading-none">
        {score === null ? (
          <span className="text-ink-2 text-[15px] font-semibold">New</span>
        ) : (
          <>
            <span className="text-ink text-[28px] font-semibold tabular-nums">{score.toFixed(1)}</span>
            <span className="text-ink-2 mt-1 text-[11px]">out of 5</span>
          </>
        )}
      </span>
    </div>
  );
}
