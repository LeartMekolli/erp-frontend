"use client";

import { CircleCheck, CircleDashed, CircleDotDashed, Clock, TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "cn";

import { LoadFailure } from "@/components/data/load-failure";
import type { Group } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { useFormat } from "@/lib/format/use-format";
import { usePhotoUrl, useWorkflowVersion } from "@/lib/production/queries";
import { qualityCards, type QualityCard, type QualityState } from "@/lib/production/quality";

const list = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

function stateText(state: QualityState): { Icon: LucideIcon; text: string } {
  switch (state.kind) {
    case "failed":
      return { Icon: TriangleAlert, text: `${state.count} failed` };
    case "waiting":
      return { Icon: Clock, text: `${state.count} waiting` };
    case "so_far":
      return { Icon: CircleDotDashed, text: `${state.passed} passed so far` };
    case "through":
      return { Icon: CircleCheck, text: "All through" };
    case "not_reached":
      return { Icon: CircleDashed, text: "Not reached yet" };
  }
}

/** Passed, failed and waiting side by side, in proportion. */
function Bar({ card }: { card: QualityCard }) {
  const total = card.passed + card.failed + card.waiting;
  const parts = [
    { value: card.passed, tone: "bg-ship" },
    { value: card.failed, tone: "bg-collect" },
    { value: card.waiting, tone: "bg-lilac-2" },
  ];
  return (
    <div
      role="img"
      aria-label={`${card.passed} passed, ${card.failed} failed, ${card.waiting} waiting`}
      className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-line"
    >
      {total > 0 &&
        parts
          .filter((part) => part.value > 0)
          .map((part) => <div key={part.tone} className={part.tone} style={{ width: `${(part.value / total) * 100}%` }} />)}
    </div>
  );
}

function CheckPhoto({ photo, alt }: { photo: NonNullable<QualityCard["latestCheck"]>["photos"][number]; alt: string }) {
  const url = usePhotoUrl(photo.file_id, photo.file_version_id);
  return (
    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-ground">
      {/* A signed link that runs out: next/image would keep a copy under a dead address. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url.data} alt={alt} className="size-full object-cover" />
    </div>
  );
}

function LatestCheck({ card }: { card: QualityCard }) {
  const { dateTime } = useFormat();
  const mayView = useCan("file.read");
  const check = card.latestCheck;
  if (!check) return null;
  const photo = check.photos[0];
  return (
    <div className="flex items-center gap-2.5 border-t border-line pt-2">
      {mayView && photo && <CheckPhoto photo={photo} alt={`Latest check at ${card.name}`} />}
      <div className="flex min-w-0 flex-col text-caption">
        <p className="font-medium break-words text-ink">{`Latest check by ${check.actor.name}${check.partner ? ` at ${check.partner.name}` : ""}`}</p>
        <p className="text-ink-2">{dateTime(check.created_at)}</p>
      </div>
    </div>
  );
}

function Card({ card }: { card: QualityCard }) {
  const { Icon, text } = stateText(card.state);
  const failed = card.state.kind === "failed";
  return (
    <article aria-label={card.name} className={cn("flex min-w-0 flex-col gap-2 rounded-2xl border p-3.5", failed ? "border-collect" : "border-line")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold break-words">{card.name}</h3>
        <p className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums">
          <Icon aria-hidden className={cn("size-3.5 shrink-0", failed ? "text-collect" : "text-ink-2")} />
          {text}
        </p>
      </div>
      <Bar card={card} />
      <p className="text-caption text-ink-2 tabular-nums">{`${card.passed} passed · ${card.failed} failed · ${card.waiting} waiting`}</p>
      {card.inRework > 0 && <p className="text-caption text-ink-2 tabular-nums">{`${card.inRework} being redone`}</p>}
      {card.sampling && (
        <p className="text-caption text-ink-2 tabular-nums">
          <span>{`Sampled: ${card.sampling.inspect} of every ${card.sampling.of_every}`}</span>
          <br />
          <span>{`Inspected ${card.passed - card.notInspected + card.failed}, left out ${card.notInspected}`}</span>
        </p>
      )}
      {card.defects.length > 0 && (
        <ul aria-label={`Defects at ${card.name}`} className="flex flex-col gap-0.5 text-sm">
          {card.defects.map((defect) => (
            <li key={defect.key} className="flex justify-between gap-3">
              <span className="break-words">{defect.name}</span>
              <span className="font-medium tabular-nums">{defect.count}</span>
            </li>
          ))}
        </ul>
      )}
      <LatestCheck card={card} />
    </article>
  );
}

/** Each checked step of a line at a glance: what passed and failed there, the defects found and the latest check. */
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
