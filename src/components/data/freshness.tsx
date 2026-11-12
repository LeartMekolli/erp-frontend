"use client";

import { useFormat } from "@/lib/format/use-format";
import { useOnline } from "@/lib/query/use-online";
import { useNow } from "@/lib/use-now";

const TICK_MS = 30_000;
const MINUTE = 60_000;

/** How fresh a screen's data is, and whether it can be refreshed at all. */
export function Freshness({ query }: { query: { dataUpdatedAt: number; isError: boolean } }) {
  const { time } = useFormat();
  const online = useOnline();
  const now = useNow(TICK_MS);

  const loadedAt = time(new Date(query.dataUpdatedAt).toISOString());
  const minutes = Math.floor((now - query.dataUpdatedAt) / MINUTE);

  let text: string;
  if (!online) text = `You're offline. Showing what was loaded at ${loadedAt}.`;
  else if (query.isError) text = `Couldn't refresh. Showing what was loaded at ${loadedAt}.`;
  else if (minutes < 1) text = "Updated just now";
  else if (minutes < 60) text = `Updated ${minutes} min ago`;
  else text = `Updated at ${loadedAt}`;

  return (
    <p role="status" className="text-caption text-ink-2">
      {text}
    </p>
  );
}
