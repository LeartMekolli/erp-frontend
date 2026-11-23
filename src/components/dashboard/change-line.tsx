import { cn } from "cn";

import type { Change } from "./headline";

/**
 * "▲ 12% vs previous 30 days (€43,040)". The arrow says which way it moved. Where down is better (the
 * defect rate) the line says "better" or "worse" too; elsewhere a screen reader hears it, so the colour
 * is never the only sign.
 */
export function ChangeLine({
  change,
  previous,
  before,
  tone,
}: {
  change: Change | null;
  /** "previous 30 days". */
  previous: string;
  /** The previous range's figure in words, if it has one. */
  before: string | null;
  tone: "light" | "dark";
}) {
  const dark = tone === "dark";
  const quiet = dark ? "text-[#9e9bb0]" : "text-ink-2";
  if (!change) return <p className={cn("mt-1 text-caption", quiet)}>{`Nothing to compare with the ${previous}`}</p>;

  const colour =
    change.better === null ? quiet : change.better ? (dark ? "text-[#6fe0b0]" : "text-violet-ink") : dark ? "text-[#ff9aa1]" : "text-late-ink";
  const verdict = change.better === null ? null : change.better ? ", better" : ", worse";
  // Down being better (or up worse) isn't what the arrow suggests, so it is said out loud.
  const surprising = change.better !== null && (change.arrow === "▼") === change.better;

  return (
    <p className={cn("mt-1 text-caption font-semibold", colour)}>
      {change.arrow && <span aria-hidden>{change.arrow} </span>}
      {change.words}
      {verdict && <span className={surprising ? undefined : "sr-only"}>{verdict}</span>}{" "}
      <span className={cn("font-normal", quiet)}>{`vs ${previous}${before ? ` (${before})` : ""}`}</span>
    </p>
  );
}
