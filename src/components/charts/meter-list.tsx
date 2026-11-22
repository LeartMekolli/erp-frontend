import { CHART } from "./tokens";

export type MeterRow = {
  key: string;
  label: string;
  /** 0 to 1. */
  value: number;
  display: string;
  /** A warning in words; also turns the fill amber. */
  warn?: string;
};

/**
 * Rows of a name, a figure and a filled track (partner load). The visible text
 * carries everything; the track is decoration. A warning is always a word.
 */
export function MeterList({ label, rows }: { label: string; rows: MeterRow[] }) {
  return (
    <ul role="list" aria-label={label} className="m-0 flex list-none flex-col gap-3.5 p-0">
      {rows.map((row) => {
        const fill = Math.min(Math.max(row.value, 0), 1);
        return (
          <li key={row.key} data-row="">
            <div className="text-ink flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 [overflow-wrap:anywhere]">{row.label}</span>
              <span className="shrink-0 font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                {row.display}
              </span>
            </div>
            {row.warn ? <div className="text-warn mt-0.5 text-[12px]">{`▲ ${row.warn}`}</div> : null}
            <div aria-hidden="true" className="bg-lilac mt-1.5 h-2 rounded-[4px]">
              <div
                data-fill=""
                className="h-full rounded-[4px]"
                style={{
                  width: `${fill * 100}%`,
                  backgroundColor: row.warn ? CHART.status.collect : CHART.violet,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
