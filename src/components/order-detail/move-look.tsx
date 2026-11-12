"use client";

import { Check, Minus, RotateCcw, X, type LucideIcon } from "lucide-react";

import type { Transition } from "@/lib/api/schema-types";
import { usePhotoUrl } from "@/lib/production/queries";

// How a move looks wherever it shows: the piece panel and a line's History.

/** A choice by its option's name; a yes/no, sent as "true" or "false", in words; anything else as given. */
export function answerText(answer: Transition["answers"][number]): string {
  if (answer.value_label !== null) return answer.value_label;
  return answer.value === "true" ? "Yes" : answer.value === "false" ? "No" : answer.value;
}

export function moveIcon(move: Pick<Transition, "kind" | "inspected">): { Icon: LucideIcon; tone: string } {
  if (move.kind === "fail") return { Icon: X, tone: "bg-collect text-ink" };
  if (move.kind === "correction") return { Icon: RotateCcw, tone: "bg-lilac text-violet-ink" };
  return move.inspected ? { Icon: Check, tone: "bg-lilac text-violet-ink" } : { Icon: Minus, tone: "bg-ground text-ink-2" };
}

/** A QC photo, opening full size in a new tab. */
export function MovePhoto({ photo, alt }: { photo: Transition["photos"][number]; alt: string }) {
  const url = usePhotoUrl(photo.file_id, photo.file_version_id);
  return (
    <a href={url.data} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-lg bg-ground">
      {/* A signed link that runs out: next/image would keep a copy under a dead address. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url.data} alt={alt} className="size-full object-cover" />
    </a>
  );
}
