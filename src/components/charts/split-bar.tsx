import { CHART } from "./tokens";

export type SplitPart = { key: string; label: string; value: number; display: string };

const BAR_HEIGHT = 28;
const RADIUS = 4;
/** A share is printed inside its part only when the part is at least this wide. */
const MIN_LABEL_SHARE = 0.12;
/** Colour indexes (in `CHART.split`) light enough to need dark text. */
const DARK_TEXT_FROM = 2;

function fillOf(part: SplitPart, index: number): string {
  return part.key === "none" ? CHART.gray : CHART.split[index % CHART.split.length];
}

/** White on the two darkest colours; ink on the lighter ones and on gray (AA at 11px). */
function textOf(part: SplitPart, index: number): string {
  if (part.key === "none") return "text-ink";
  return index % CHART.split.length < DARK_TEXT_FROM ? "text-white" : "text-ink";
}

/**
 * One bar split into parts of a whole, with a legend that carries every value.
 * The bar is decoration for sighted users; the legend is the information.
 */
export function SplitBar({
  label,
  parts,
  width,
}: {
  label: string;
  parts: SplitPart[];
  /** Fixed width in px; by default the bar fills its container. */
  width?: number;
}) {
  let total = 0;
  for (const p of parts) total += p.value > 0 ? p.value : 0;
  const drawn = total > 0 ? parts.map((part, index) => ({ part, index })).filter((d) => d.part.value > 0) : [];

  return (
    <figure aria-label={label} className="m-0" style={width !== undefined ? { width } : undefined}>
      <div
        aria-hidden="true"
        className="flex w-full gap-[2px]"
        style={{
          height: BAR_HEIGHT,
          borderRadius: RADIUS,
          backgroundColor: drawn.length === 0 ? CHART.grid : undefined,
        }}
      >
        {drawn.map(({ part, index }, i) => {
          const share = part.value / total;
          const first = i === 0;
          const last = i === drawn.length - 1;
          return (
            <div
              key={part.key}
              data-part={part.key}
              className={`flex items-center justify-center text-[11px] font-semibold ${textOf(part, index)}`}
              style={{
                flex: `${part.value} 1 0%`,
                minWidth: 0,
                backgroundColor: fillOf(part, index),
                borderTopLeftRadius: first ? RADIUS : 0,
                borderBottomLeftRadius: first ? RADIUS : 0,
                borderTopRightRadius: last ? RADIUS : 0,
                borderBottomRightRadius: last ? RADIUS : 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {share >= MIN_LABEL_SHARE ? `${Math.round(share * 100)}%` : null}
            </div>
          );
        })}
      </div>
      {parts.length > 0 && total > 0 ? (
        <ul role="list" className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
          {parts.map((part, index) => (
            <li key={part.key} className="flex items-baseline gap-2 text-[13px] text-ink">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 shrink-0 self-center rounded-[3px]"
                style={{ backgroundColor: fillOf(part, index) }}
              />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{part.label}</span>
              <span className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                {part.display}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
