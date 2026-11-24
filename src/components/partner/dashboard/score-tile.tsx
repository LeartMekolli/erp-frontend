"use client";

import { MeterList, type MeterRow } from "@/components/charts/meter-list";
import { ScoreRing } from "@/components/charts/score-ring";
import { percent } from "@/components/dashboard/headline";
import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import type { PartnerScoreResponse } from "@/lib/api/schema-types";
import { usePartnerScore } from "@/lib/partner-dashboard/queries";

import { useWorkshop } from "../use-workshop";

type PartKey = keyof PartnerScoreResponse["score"]["parts"];

/** The score's parts in erp-api's order (`score.ts`), each a share from 0 to 1. */
export const SCORE_PARTS: { key: PartKey; label: string }[] = [
  { key: "quality", label: "Quality" },
  { key: "scrap", label: "Scrap" },
  { key: "reliability", label: "Reliability" },
  { key: "on_time", label: "On time" },
  { key: "rating", label: "Rating" },
  { key: "claims", label: "Claims" },
];

/** The parts as meters. The lowest known part says so, when the known parts differ; a part with nothing to go on is never 0%. */
function partRows(parts: PartnerScoreResponse["score"]["parts"]): MeterRow[] {
  const known = SCORE_PARTS.flatMap(({ key }) => (parts[key] === null ? [] : [parts[key]]));
  const lowest = known.length > 1 && Math.min(...known) < Math.max(...known) ? Math.min(...known) : null;
  let marked = false;
  return SCORE_PARTS.map(({ key, label }) => {
    const value = parts[key];
    if (value === null) return { key, label, value: 0, display: "Not enough yet" };
    const warn = !marked && value === lowest ? "lowest" : undefined;
    if (warn) marked = true;
    return { key, label, value, display: percent(value), warn };
  });
}

/** The workshop's score as staff see it when they pick a partner: out of 5, and its six parts. */
export function ScoreTile() {
  const { partnerId } = useWorkshop();
  const score = usePartnerScore(partnerId);

  return (
    <Tile span={4} title="Your score" aside={<span className="text-caption text-ink-2">how staff see you</span>}>
      {score.data ? (
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={score.data.score.overall} />
            {score.data.score.overall === null ? (
              <p className="text-sm text-ink-2">{`New: a score shows after 5 finished jobs (${score.data.score.finished_jobs} so far).`}</p>
            ) : null}
          </div>
          <MeterList label="The parts of your score" rows={partRows(score.data.score.parts)} />
        </div>
      ) : score.isError ? (
        <LoadFailure error={score.error} fallback="Couldn't load your score." onRetry={() => void score.refetch()} />
      ) : (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Loading your score…
        </p>
      )}
    </Tile>
  );
}
