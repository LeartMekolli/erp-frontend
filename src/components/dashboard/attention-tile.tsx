"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "cn";

import { LoadFailure } from "@/components/data/load-failure";
import { ATTENTION, attentionRows } from "@/lib/dashboard/attention";
import { useDashboard } from "@/lib/dashboard/queries";

import { Tile } from "./tile";

const DOT = { late: "bg-late", collect: "bg-collect", violet: "bg-violet", warn: "bg-warn" } as const;

/** What needs someone now, whatever the range: a row per kind with its total, each opening its list. */
export function AttentionTile() {
  const dashboard = useDashboard();
  const rows = dashboard.data ? attentionRows(dashboard.data.attention) : [];

  return (
    <Tile span={4} title="Needs attention" aside={<span className="text-caption text-ink-2">Now</span>}>
      {dashboard.data ? (
        rows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">Nothing needs you right now.</p>
        ) : (
          <ul role="list" className="mt-2 flex flex-col">
            {rows.map((row) => {
              const kind = ATTENTION[row.kind];
              return (
                <li key={row.kind} className="border-b border-line last:border-b-0">
                  <Link
                    href={kind.href}
                    className="flex min-h-11 items-center gap-2.5 rounded-lg text-sm text-ink hover:bg-ground focus-visible:outline-2 focus-visible:outline-violet"
                  >
                    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[kind.dot])} />
                    <span className="min-w-0 flex-1">{kind.words}</span>{" "}
                    <span className="font-semibold tabular-nums">{row.total}</span>
                    <ChevronRight aria-hidden className="size-4 text-ink-2" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : dashboard.isError ? (
        <LoadFailure error={dashboard.error} fallback="Couldn't load what needs attention." onRetry={() => void dashboard.refetch()} />
      ) : (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Loading…
        </p>
      )}
    </Tile>
  );
}
