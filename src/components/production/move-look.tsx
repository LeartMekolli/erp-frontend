"use client";

import { Check, Minus, RotateCcw, X, type LucideIcon } from "lucide-react";

import type { MoveEntry, Photo } from "@/lib/production/shape";

import { usePhotoLink, usePhotoLinks } from "./photo-links";

// How a move looks wherever it shows: the piece panel and History.

/** A choice by its option's name; a yes/no, sent as "true" or "false", in words; anything else as given. */
export function answerText(answer: MoveEntry["answers"][number]): string {
  if (answer.value_label !== null) return answer.value_label;
  return answer.value === "true" ? "Yes" : answer.value === "false" ? "No" : answer.value;
}

export function moveIcon(move: Pick<MoveEntry, "kind" | "inspected">): { Icon: LucideIcon; tone: string } {
  if (move.kind === "fail") return { Icon: X, tone: "bg-collect text-ink" };
  if (move.kind === "correction") return { Icon: RotateCcw, tone: "bg-lilac text-violet-ink" };
  return move.inspected ? { Icon: Check, tone: "bg-lilac text-violet-ink" } : { Icon: Minus, tone: "bg-ground text-ink-2" };
}

/** A move's first photo, with how many more there are; their number alone for someone who may not see photos. */
export function MovePhotos({ photos, at }: { photos: Photo[]; at: string | null }) {
  const { mayView } = usePhotoLinks();
  const count = photos.length;
  const first = photos[0];
  if (!first) return null;
  if (!mayView) return <p className="text-caption text-ink-2">{`${count} ${count === 1 ? "photo" : "photos"}`}</p>;
  return (
    <div className="relative self-start">
      <MovePhoto photo={first} alt={`Photo 1 at ${at ?? "this step"}`} />
      {count > 1 && (
        <span className="absolute right-1 bottom-1 rounded-md bg-ink/70 px-1.5 text-caption text-card tabular-nums">{`+${count - 1}`}</span>
      )}
    </div>
  );
}

/** What was written with a move: its comment, the checklist's answers, and why its outcome was changed. */
export function MoveFacts({ comment, answers, override }: { comment: string | null; answers: MoveEntry["answers"]; override: string | null }) {
  return (
    <>
      {comment && <p className="break-words">{comment}</p>}
      {answers.length > 0 && (
        <dl className="grid gap-x-3.5 gap-y-0.5 text-sm sm:grid-cols-[max-content_1fr]">
          {answers.map((answer) => (
            <div key={answer.item} className="contents">
              <dt className="text-ink-2">{answer.label}</dt>
              <dd className="font-medium break-words max-sm:mb-1">
                {answerText(answer)}
                {answer.note && ` (${answer.note})`}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {override && <p className="text-sm break-words">{override}</p>}
    </>
  );
}

/** A QC photo, opening full size in a new tab. */
export function MovePhoto({ photo, alt }: { photo: Photo; alt: string }) {
  const url = usePhotoLink(photo);
  return (
    <a href={url.data} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-lg bg-ground">
      {/* A signed link that runs out: next/image would keep a copy under a dead address. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url.data} alt={alt} className="size-full object-cover" />
    </a>
  );
}
