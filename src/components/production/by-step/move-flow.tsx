"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { MoveDialog } from "@/components/production/move-dialog";
import type { MoveBody, StepGroup } from "@/lib/api/schema-types";
import { isApiProblem } from "@/lib/api/problem";
import { moveTargets } from "@/lib/production/by-step";
import { keepVersion, pickedLines, pieceIds, pruneLines, versions, type LineSelection } from "@/lib/production/line-selection";
import type { MoveKind, MoveTarget } from "@/lib/production/move-body";
import { fetchLinePieces, invalidateProduction, useMovePieces, useWorkflowVersion } from "@/lib/production/queries";
import { nextStepName } from "@/lib/production/selection";
import type { NextStep, Piece } from "@/lib/production/shape";
import { staffPiece, staffRules } from "@/lib/production/staff";
import { useOnline } from "@/lib/query/use-online";
import type { UploadTarget } from "@/lib/upload/upload";

import type { SelectionUpdate } from "./lines-table";
import { SelectionBar } from "./selection-bar";

/** erp-api takes at most this many pieces in one move (`POST /workflow/moves`). */
const MOVE_LIMIT = 1000;

const PHOTOS: UploadTarget = { area: "staff", kind: "image" };

const count = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;

/**
 * Whether a refusal names pieces (`work_order_ids.N`). erp-api says so for pieces someone else moved, but also
 * for an order waiting for payment and an assembly waiting for its parts, so only a re-read tells which.
 */
function namesPieces(error: unknown): boolean {
  if (!isApiProblem(error) || error.status !== 409) return false;
  return (error.errors ?? []).some((item) => /^work_order_ids\.\d+$/.test(item.path));
}

/**
 * Each picked line's pieces still at the step that the person may work, read again from erp-api. A piece held
 * since it was ticked (its parts, its order's payment) hasn't moved on, so it stays, and erp-api's refusal says
 * why. `unread` is true when a line couldn't be read: its picked pieces are kept, but nothing may be moved without them.
 */
async function stillHere(client: QueryClient, selection: LineSelection): Promise<{ here: Map<string, Set<string>>; pieces: Piece[]; unread: boolean }> {
  const read = await Promise.all(
    [...selection.lines.keys()].map(async (groupId) => {
      try {
        const items = (await fetchLinePieces(client, groupId, selection.stepKey)).map(staffPiece);
        return [groupId, items.filter((piece) => piece.status === "active" && piece.stepKey === selection.stepKey && (piece.mayWork || piece.held !== null))] as const;
      } catch {
        return [groupId, null] as const;
      }
    }),
  );
  const here = new Map<string, Set<string>>();
  const pieces: Piece[] = [];
  let unread = false;
  for (const [groupId, items] of read) {
    const picked = selection.lines.get(groupId)!.ids;
    if (items === null) {
      unread = true;
      here.set(groupId, picked);
      continue;
    }
    here.set(groupId, new Set(items.map((piece) => piece.id)));
    pieces.push(...items.filter((piece) => picked.has(piece.id)));
  }
  return { here, pieces, unread };
}

type Open = { kind: MoveKind; target?: MoveTarget; pieces: Piece[] };

/**
 * The bar for By step's picked lines, and the move dialog its buttons open. The rules come from the version
 * the picked lines started on; lines on different versions must be narrowed to one first.
 */
export function MoveFlow({
  workflowId,
  stepKey,
  selection,
  lines,
  onSelection,
  onNotice,
  onMoved,
  onCleared,
  mayUpload,
}: {
  /** Whether this person may add photos (`file.write`). */
  mayUpload: boolean;
  workflowId: string;
  stepKey: string;
  selection: LineSelection;
  /** The listed lines at the step. */
  lines: StepGroup[];
  onSelection: (update: SelectionUpdate) => void;
  /** What happened, for the page's polite announcement. */
  onNotice: (message: string) => void;
  /**
   * After a move went through; the selection is already clear. `index` is where the first moved line was
   * listed (-1 when a search hid them all), `sentAt` when the move was sent, so the page can wait for the
   * list fetched since and put focus where the line was.
   */
  onMoved: (at: { index: number; sentAt: number }) => void;
  /** The selection emptied because every picked piece moved on. */
  onCleared: () => void;
}) {
  const client = useQueryClient();
  const online = useOnline();
  const move = useMovePieces();
  const [open, setOpen] = useState<Open | null>(null);
  const [opening, setOpening] = useState(false);
  // Where the last move sent started from, for `onMoved`.
  const sent = useRef<{ index: number; sentAt: number } | null>(null);

  const onVersions = versions(selection);
  const single = onVersions.length === 1 ? onVersions[0]! : null;
  const version = useWorkflowVersion(workflowId, single ?? onVersions[0]!);
  const path = version.data?.steps.map((step) => ({ key: step.key, name: step.name })) ?? [];
  const configured = single === null ? undefined : version.data?.steps.find((step) => step.key === stepKey);
  const rules = configured ? staffRules(configured, path) : undefined;
  const nextName = nextStepName(path, stepKey);
  // Named from the path as soon as it loads, even while the move is blocked: the button says where pieces go.
  const next: NextStep = version.data ? (nextName ? { name: nextName } : null) : "unknown";
  const ids = pieceIds(selection);

  const picked = pickedLines(selection, lines);
  const partners = [...new Set(picked.flatMap((line) => (line.group.partner ? [line.group.partner.name] : [])))];
  const countsFor = rules?.partnerStep && partners.length > 0 ? partners.join(" and ") : null;

  let blockedReason: string | null = null;
  if (!online) blockedReason = "You're offline.";
  else if (single === null) blockedReason = "These are on different versions of the workflow and can't move together.";
  else if (ids.length > MOVE_LIMIT) blockedReason = "A move takes up to 1,000 pieces. Untick some to go on.";
  else if (version.isError) blockedReason = "This step's checks couldn't be loaded.";
  else if (!rules) blockedReason = "Loading this step's checks…";
  else if (opening) blockedReason = "Getting the pieces ready…";
  // Only the wait for the pieces: every other reason disables the buttons outright.
  const busy = opening && blockedReason === "Getting the pieces ready…";

  /** Keeps the selection to `next`; when nothing is left the bar goes, and focus with it, so the page places it. */
  function narrow(next: LineSelection | null) {
    onSelection(() => next);
    if (!next) onCleared();
  }

  /** Reads the picked pieces again, drops those gone, and opens the dialog with the rest. */
  async function start(kind: MoveKind, target?: MoveTarget) {
    setOpening(true);
    try {
      const { here, pieces, unread } = await stillHere(client, selection);
      const pruned = pruneLines(selection, here);
      if (pruned.dropped > 0) {
        narrow(pruned.selection);
        onNotice(`${count(pruned.dropped)} moved on and left your selection.`);
      }
      // A move without a line that couldn't be read would leave it behind and still clear the selection.
      if (unread) onNotice("Some pieces couldn't be loaded. Try again.");
      else if (pruned.selection) setOpen({ kind, target, pieces });
    } finally {
      setOpening(false);
    }
  }

  async function send(body: MoveBody) {
    sent.current = { index: lines.findIndex((line) => selection.lines.has(line.group.id)), sentAt: Date.now() };
    try {
      await move.mutateAsync(body);
    } catch (error) {
      if (namesPieces(error)) {
        await invalidateProduction(client);
        const pruned = pruneLines(selection, (await stillHere(client, selection)).here);
        if (pruned.dropped > 0) {
          // The dialog closes, so what it would have said is left to the page; the error still ends its submit.
          setOpen(null);
          narrow(pruned.selection);
          onNotice(`Someone already moved ${pruned.dropped} of these. The list is up to date now.`);
        }
        // Nothing left the step: the refusal is about these pieces (payment, parts), and the dialog shows erp-api's words.
      }
      throw error;
    }
  }

  return (
    <>
      <SelectionBar
        selection={selection}
        lines={lines}
        next={next}
        targets={rules ? moveTargets(rules) : null}
        blockedReason={blockedReason}
        busy={busy}
        versions={onVersions}
        onPass={() => void start("pass")}
        onTarget={(target) => void start("fail", target)}
        onKeepVersion={(kept) => onSelection((current) => (current ? keepVersion(current, kept) : current))}
        onClear={() => onSelection(() => null)}
      />
      {rules && open && (
        <MoveDialog
          open
          kind={open.kind}
          target={open.target}
          rules={rules}
          path={path}
          next={next}
          pieces={open.pieces}
          mayUpload={mayUpload}
          uploadTarget={PHOTOS}
          countsFor={countsFor}
          onMove={send}
          onOpenChange={(isOpen) => {
            if (!isOpen) setOpen(null);
          }}
          onMoved={(message) => {
            onSelection(() => null);
            onNotice(message);
            onMoved(sent.current ?? { index: -1, sentAt: Date.now() });
          }}
        />
      )}
    </>
  );
}
