"use client";

import { Clock } from "lucide-react";

import type { Group } from "@/lib/api/schema-types";
import { useWorkflowVersion } from "@/lib/production/queries";
import { qualityCards, type QualityCard } from "@/lib/production/quality";

import { LoadFailure } from "./load-failure";

const list = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

function Card({ card }: { card: QualityCard }) {
  return (
    <article aria-label={card.name} className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-line p-3.5">
      <h3 className="font-semibold break-words">{card.name}</h3>
      <p className="inline-flex items-center gap-1.5 text-sm text-ink-2 tabular-nums">
        <Clock aria-hidden className="size-3.5 shrink-0" />
        <span>{card.inRework > 0 ? `${card.waiting} waiting, ${card.inRework} being redone` : `${card.waiting} waiting`}</span>
      </p>
      {card.sampling && <p className="text-caption text-ink-2 tabular-nums">{`Sampled: ${card.sampling.inspect} of every ${card.sampling.of_every}`}</p>}
    </article>
  );
}

/**
 * Each checked step of a line at a glance. erp-api doesn't add up passes and
 * failures per step yet (`backend-todos.md`), so the cards say only what's waiting.
 */
export function QualityTab({ group }: { group: Group }) {
  const version = useWorkflowVersion(group.workflow.id, group.workflow.version);

  if (version.isPending) {
    return <div role="status" aria-label="Loading the quality checks" className="h-24 animate-pulse rounded-2xl bg-panel-soft motion-reduce:animate-none" />;
  }
  if (!version.data) {
    return <LoadFailure error={version.error} fallback="The quality checks couldn't be loaded." onRetry={() => void version.refetch()} />;
  }

  const { cards, noChecks } = qualityCards(group.steps, version.data.steps);
  if (cards.length === 0) return <p className="py-2 text-sm text-ink-2">No step on this line has quality checks.</p>;

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.key} card={card} />
        ))}
      </div>
      {noChecks.length > 0 && <p className="text-caption text-ink-2">{`No checks at ${list.format(noChecks)}.`}</p>}
    </div>
  );
}
