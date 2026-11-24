"use client";

import { HBars } from "@/components/charts/hbars";
import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import { useFormat } from "@/lib/format/use-format";
import { usePartnerScore } from "@/lib/partner-dashboard/queries";

import { useWorkshop } from "../use-workshop";

const STARS = [5, 4, 3, 2, 1] as const;

/**
 * The latest ratings (erp-api sends the 50 newest) by stars, and the newest comment staff chose to share.
 * The customer is never named: erp-api doesn't send who rated.
 */
export function RatingsTile() {
  const { partnerId } = useWorkshop();
  const score = usePartnerScore(partnerId);
  const { date } = useFormat();
  const ratings = score.data?.ratings ?? [];
  const shared = ratings.find((rating) => rating.comment !== null);

  return (
    <Tile
      span={3}
      title="Ratings"
      aside={ratings.length > 0 ? <span className="text-caption text-ink-2">{`latest ${ratings.length}`}</span> : undefined}
    >
      {score.data ? (
        ratings.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No ratings yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <HBars
              label="Your latest ratings by stars"
              data={STARS.map((stars) => {
                const count = ratings.filter((rating) => rating.stars === stars).length;
                return { key: String(stars), label: stars === 1 ? "1 star" : `${stars} stars`, value: count, display: String(count) };
              })}
            />
            {shared ? (
              <figure className="m-0 border-t border-line pt-3">
                <span role="img" aria-label={`${shared.stars} of 5`} className="block text-[13px] tracking-[0.1em] text-violet">
                  {"★".repeat(shared.stars) + "☆".repeat(5 - shared.stars)}
                </span>
                <blockquote className="m-0 mt-1 text-sm text-ink [overflow-wrap:anywhere]">{shared.comment}</blockquote>
                <figcaption className="mt-1 text-caption text-ink-2">{date(shared.created_at)}</figcaption>
              </figure>
            ) : null}
          </div>
        )
      ) : score.isError ? (
        <LoadFailure error={score.error} fallback="Couldn't load your ratings." onRetry={() => void score.refetch()} />
      ) : (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Loading your ratings…
        </p>
      )}
    </Tile>
  );
}
