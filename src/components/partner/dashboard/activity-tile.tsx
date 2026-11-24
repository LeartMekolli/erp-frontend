"use client";

import Link from "next/link";

import { Tile } from "@/components/dashboard/tile";
import { LoadFailure } from "@/components/data/load-failure";
import { usePartnerMe } from "@/components/session/use-partner-me";
import { useFeed } from "@/components/shell/notifications/queries";
import { dayKey } from "@/lib/format/dates";
import { useFormat } from "@/lib/format/use-format";
import { useNow } from "@/lib/use-now";

import { partnerSubjectHref } from "../subject-href";
import { useWorkshop } from "../use-workshop";

/** How many notifications the tile lists; the bell has them all. */
const SHOWN = 5;

/**
 * The person's newest notifications, the same feed as the bell: a time today, else a day, and the
 * title, opening what it's about where there is a page for it. erp-api's feed is the person's, not the
 * workshop's, so someone at two workshops sees both here, each linking under its own workshop.
 */
export function ActivityTile({ wide }: { wide: boolean }) {
  const { partnerId } = useWorkshop();
  const feed = useFeed();
  const me = usePartnerMe().data;
  const format = useFormat();
  const today = dayKey(new Date(useNow(60_000)).toISOString(), format.timeZone);
  const roleAt = (id: string) => me?.partners.find((partner) => partner.id === id)?.role;
  const shown = feed.items.slice(0, SHOWN);

  return (
    <Tile span={wide ? 12 : 6} title="Recent activity" aside={<span className="text-caption text-ink-2">your notifications</span>}>
      {feed.isPending ? (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Loading your notifications…
        </p>
      ) : feed.isError && shown.length === 0 ? (
        <LoadFailure error={feed.error} fallback="Couldn't load your notifications." onRetry={() => void feed.refetch()} />
      ) : shown.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">Nothing yet.</p>
      ) : (
        <ul role="list" className="mt-3 flex flex-col divide-y divide-line">
          {shown.map((entry) => {
            const href = partnerSubjectHref(entry, partnerId, roleAt);
            const when = dayKey(entry.created_at, format.timeZone) === today ? format.time(entry.created_at) : format.date(entry.created_at);
            const body = (
              <>
                <time dateTime={entry.created_at} className="w-24 shrink-0 text-caption text-ink-2 tabular-nums">
                  {when}
                </time>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{entry.title}</span>
              </>
            );
            return (
              <li key={entry.id}>
                {href ? (
                  <Link
                    href={href}
                    className="flex items-baseline gap-3 rounded-md py-2 hover:bg-ground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet pointer-coarse:py-3"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-baseline gap-3 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Tile>
  );
}
