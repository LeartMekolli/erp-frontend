"use client";

import { ChevronDown, FileText } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "cn";

import { LoadFailure } from "@/components/data/load-failure";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { isApiProblem } from "@/lib/api/problem";
import { openLink } from "@/lib/files/open-link";
import { useFormat } from "@/lib/format/use-format";
import { actorText } from "@/lib/production/history";
import type { PieceStory, StoryMove } from "@/lib/production/shape";

import { answerText, MovePhoto, moveIcon } from "./move-look";
import { useOpenPiece } from "./open-piece";
import { usePhotoLinks } from "./photo-links";
import { submitErrorText } from "./submit-error";

const LABEL = "text-caption text-ink-2";

/** A piece's story as a query gives it. A hook: it must stay the same function for the life of the panel. */
export type UseStory = (id: string) => { data: PieceStory | undefined; isPending: boolean; error: unknown; refetch: () => unknown };

/** erp-api records a cancelled piece as a correction to no step (`work-orders.service.ts:165`). */
const isCancel = (move: StoryMove) => move.kind === "correction" && !move.to_step;

function moveTitle(move: StoryMove): string {
  const at = move.from_step?.name ?? "Reopened";
  if (isCancel(move)) return "Cancelled";
  if (move.kind === "correction") return `Corrected to ${move.to_step?.name}`;
  if (move.kind === "fail") return `${at} failed`;
  return move.inspected ? `${at} passed` : `${at} passed, not inspected`;
}

function nextText(move: StoryMove): string {
  if (isCancel(move)) return "Cancelled";
  if (move.outcome === "scrap") return "Scrapped";
  if (move.outcome === "rework") return `Back to ${move.to_step?.name ?? "an earlier step"}`;
  return move.to_step ? `On to ${move.to_step.name}` : "Finished";
}

/** Where the piece is now. */
function nowText(piece: PieceStory): string {
  if (piece.status === "finished") return "Finished";
  if (piece.status === "scrapped") return "Scrapped";
  if (piece.status === "cancelled") return "Cancelled";
  const name = piece.step?.name ?? "";
  return piece.inRework ? `Being redone at ${name}` : `At ${name}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={LABEL}>{label}</span>
      <span className="text-right font-medium break-words">{children}</span>
    </div>
  );
}

function Move({ move, stepName }: { move: StoryMove; stepName: string }) {
  const { dateTime } = useFormat();
  const { mayView } = usePhotoLinks();
  const [open, setOpen] = useState(move.kind === "fail");
  const { Icon, tone } = moveIcon(move);
  const count = move.photos.length;

  return (
    <li className="grid grid-cols-[22px_1fr] gap-2.5">
      <span aria-hidden className={cn("mt-2.5 grid size-[22px] place-items-center rounded-full", tone)}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left hover:bg-panel-soft"
        >
          <span className="min-w-0 font-semibold break-words">{moveTitle(move)}</span>{" "}
          <span className={cn(LABEL, "ml-auto shrink-0")}>{dateTime(move.created_at)}</span>
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-2 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
        </button>
        {open && (
          <div className="mb-2 flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5">
            {move.defect && <Row label="Defect">{move.defect.name}</Row>}
            {move.answers.map((answer) => (
              <Row key={answer.item} label={answer.label}>
                {answerText(answer)}
                {answer.note && ` (${answer.note})`}
              </Row>
            ))}
            <Row label="What happens next">{nextText(move)}</Row>
            {move.override_reason && <Row label="Changed because">{move.override_reason}</Row>}
            {move.comment && <p className="break-words">{move.comment}</p>}
            {count > 0 &&
              (mayView ? (
                <div className="flex flex-wrap gap-2">
                  {move.photos.map((photo, index) => (
                    <MovePhoto key={photo.fileVersionId} photo={photo} alt={`Photo ${index + 1} at ${stepName}`} />
                  ))}
                </div>
              ) : (
                <p className={LABEL}>{`${count} ${count === 1 ? "photo" : "photos"}`}</p>
              ))}
            <p className={LABEL}>{actorText(move)}</p>
          </div>
        )}
      </div>
    </li>
  );
}

/** The current step's instructions, opened in a new tab. */
function Instructions({ link, stepName }: { link: () => Promise<string>; stepName: string }) {
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium underline underline-offset-2 hover:text-ink"
        onClick={() => {
          setFailure(null);
          openLink(link).catch((error: unknown) => setFailure(submitErrorText(error)));
        }}
      >
        <FileText aria-hidden className="size-4 shrink-0" />
        {`Instructions for ${stepName}`}
      </button>
      {failure && <p className="text-caption text-late">{failure}</p>}
    </div>
  );
}

function PieceHistory({ id, useStory, sopLink }: { id: string; useStory: UseStory; sopLink: ((story: PieceStory) => Promise<string>) | null }) {
  const piece = useStory(id);
  const openPiece = useOpenPiece().open;

  if (piece.isPending) {
    return (
      <>
        <SheetTitle className="text-base font-semibold">Loading the piece</SheetTitle>
        <SheetDescription className="sr-only">Its moves will show here.</SheetDescription>
        <div role="status" aria-label="Loading the piece" className="h-40 animate-pulse rounded-xl bg-panel-soft motion-reduce:animate-none" />
      </>
    );
  }

  if (!piece.data) {
    // erp-api answers 404 for a piece it doesn't have, and 400 for an id that fails its check.
    if (isApiProblem(piece.error) && (piece.error.status === 404 || piece.error.status === 400)) {
      return (
        <>
          <SheetTitle className="text-base font-semibold">We couldn&apos;t find this piece</SheetTitle>
          <SheetDescription className="text-sm text-ink-2">It may no longer be there.</SheetDescription>
        </>
      );
    }
    return (
      <>
        <SheetTitle className="text-base font-semibold">This piece couldn&apos;t be loaded</SheetTitle>
        <SheetDescription className="sr-only">Try again to load its moves.</SheetDescription>
        <LoadFailure error={piece.error} fallback="This piece couldn't be loaded." onRetry={() => void piece.refetch()} />
      </>
    );
  }

  const data = piece.data;
  const replacesId = data.replacesId;
  return (
    <>
      <div className="flex flex-col gap-0.5 pr-8">
        <SheetTitle className="text-base font-semibold tabular-nums">{`Piece ${data.label}`}</SheetTitle>
        <SheetDescription className="text-sm font-medium text-ink">{nowText(data)}</SheetDescription>
      </div>
      {sopLink && data.sop && data.step && <Instructions link={() => sopLink(data)} stepName={data.step.name} />}
      {replacesId && (
        <button type="button" onClick={() => openPiece(replacesId)} className="cursor-pointer self-start text-left text-sm underline underline-offset-2">
          See the piece this replaces
        </button>
      )}
      {data.history.length === 0 ? (
        <p className="text-sm text-ink-2">It hasn&apos;t moved yet.</p>
      ) : (
        <ol aria-label="Moves" className="flex flex-col">
          {data.history.map((move) => (
            <Move key={move.id} move={move} stepName={move.from_step?.name ?? "this step"} />
          ))}
        </ol>
      )}
    </>
  );
}

/**
 * One piece's story, sliding over the page from the right, or up from the bottom on phones. `sopLink` opens
 * the current step's instructions, or is null where this person may not.
 */
export function PiecePanel({
  id,
  onClose,
  useStory,
  sopLink,
}: {
  id: string | null;
  onClose: () => void;
  useStory: UseStory;
  sopLink: ((story: PieceStory) => Promise<string>) | null;
}) {
  return (
    <Sheet
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="gap-3 overflow-y-auto p-5 data-[side=right]:sm:max-w-md max-sm:data-[side=right]:top-auto max-sm:data-[side=right]:bottom-0 max-sm:data-[side=right]:h-[85dvh] max-sm:data-[side=right]:w-full max-sm:data-[side=right]:rounded-t-2xl max-sm:data-[side=right]:border-l-0">
        {id && <PieceHistory key={id} id={id} useStory={useStory} sopLink={sopLink} />}
      </SheetContent>
    </Sheet>
  );
}
