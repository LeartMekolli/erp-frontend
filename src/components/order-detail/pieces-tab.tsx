"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "cn";

import { Button } from "@/components/ui/button";
import type { Group } from "@/lib/api/schema-types";
import { useStepPieces, type PieceListStatus } from "@/lib/production/queries";

import { LoadFailure } from "./load-failure";
import { PieceRow } from "./piece-row";

interface Section {
  id: string;
  name: string;
  count: number;
  inRework: number;
  stepKey: string | null;
  status: PieceListStatus;
}

/** The steps holding pieces, in path order, then finished and scrapped. */
function sectionsOf(group: Group): Section[] {
  const steps = group.steps
    .filter((step) => step.count > 0)
    .map((step): Section => ({ id: step.key, name: step.name, count: step.count, inRework: step.in_rework, stepKey: step.key, status: "active" }));
  const off = (["finished", "scrapped"] as const)
    .filter((status) => group.pieces[status] > 0)
    .map((status): Section => ({
      id: `status:${status}`,
      name: status === "finished" ? "Finished" : "Scrapped",
      count: group.pieces[status],
      inRework: 0,
      stepKey: null,
      status,
    }));
  return [...steps, ...off];
}

function PieceSection({ groupId, section, open, onToggle }: { groupId: string; section: Section; open: boolean; onToggle: () => void }) {
  const pieces = useStepPieces(groupId, section.stepKey, section.status, open);
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-sm hover:bg-panel-soft"
      >
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-2 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
        <span className="min-w-0 font-semibold break-words">{section.name}</span>{" "}
        <span className="text-ink-2 tabular-nums">
          {section.count}
          {section.inRework > 0 && ` · ${section.inRework} being redone`}
        </span>
      </button>
      {open && (
        <div className="pb-1">
          {pieces.isPending ? (
            <div role="status" aria-label={`Loading the pieces at ${section.name}`} className="h-11 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />
          ) : pieces.isError && pieces.items.length === 0 ? (
            <LoadFailure error={pieces.error} fallback="These pieces couldn't be loaded." onRetry={() => void pieces.refetch()} />
          ) : pieces.items.length === 0 ? (
            <p className="px-1 py-2 text-sm text-ink-2">Nothing here now.</p>
          ) : (
            <ul>
              {pieces.items.map((piece) => (
                <PieceRow key={piece.id} piece={piece} />
              ))}
            </ul>
          )}
          {pieces.hasNextPage && (
            <Button variant="link" disabled={pieces.isFetchingNextPage} onClick={() => void pieces.fetchNextPage()}>
              Show more at {section.name}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** A line's pieces grouped by where they are; each group loads when it's opened. */
export function PiecesTab({ group }: { group: Group }) {
  // Only what someone has opened or closed; the first group with pieces starts open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const sections = sectionsOf(group);
  const firstId = sections[0]?.id;

  if (sections.length === 0) return <p className="py-2 text-sm text-ink-2">No pieces yet.</p>;

  return (
    <div className="flex flex-col">
      {sections.map((section) => {
        const open = toggled[section.id] ?? section.id === firstId;
        return (
          <PieceSection
            key={section.id}
            groupId={group.id}
            section={section}
            open={open}
            onToggle={() => setToggled((current) => ({ ...current, [section.id]: !open }))}
          />
        );
      })}
    </div>
  );
}
