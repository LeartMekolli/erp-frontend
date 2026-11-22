import { CHART } from "./tokens";

export type HBarsDatum = { key: string; label: string; value: number; display: string };

/**
 * A ranking as plain HTML: every name and figure is visible text, so it needs no
 * hidden table or tooltip. Rows keep the order given.
 */
export function HBars({ label, data }: { label: string; data: HBarsDatum[] }) {
  let max = 0;
  for (const d of data) max = Math.max(max, d.value);

  return (
    <ul
      role="list"
      aria-label={label}
      className="m-0 grid list-none grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] gap-y-2.5 p-0"
    >
      {data.map((d) => (
        <li
          key={d.key}
          className="col-span-3 grid grid-cols-subgrid items-center gap-x-3"
        >
          <span className="text-ink text-[13px] leading-[1.25]">{d.label}</span>
          <span aria-hidden="true" className="block h-2 min-w-0">
            {d.value > 0 && max > 0 ? (
              <span
                data-bar
                className="block h-2 rounded-[4px]"
                style={{ width: `${(d.value / max) * 100}%`, backgroundColor: CHART.violet }}
              />
            ) : null}
          </span>
          <span
            className="text-ink text-right text-[13px] font-semibold"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {d.display}
          </span>
        </li>
      ))}
    </ul>
  );
}
