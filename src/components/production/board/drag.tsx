"use client";

import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { cn } from "cn";
import { GripVertical } from "lucide-react";

import { HerePill } from "@/components/production/by-step/line-row";
import type { StepGroup } from "@/lib/api/schema-types";
import type { DragItem } from "@/lib/production/board";
import type { Piece } from "@/lib/production/shape";

/** What a column says while a card that may land on it is dragged. */
export type DropZone = "pass" | "back" | null;

/**
 * The arrow keys jump the dragged card from step to step: ← and → to the centre of the next droppable column
 * (only the ones it may land on are), ↑ and ↓ do nothing. Space or Enter drops, Escape puts it back.
 */
const stepByStep: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") return undefined;
  event.preventDefault();
  const rect = context.collisionRect;
  if (!rect) return undefined;
  const at = rect.left + rect.width / 2;
  const centres = context.droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const box = context.droppableRects.get(container.id);
      return box ? [box.left + box.width / 2] : [];
    })
    .sort((a, b) => a - b);
  const to = event.code === "ArrowRight" ? centres.find((x) => x > at + 1) : centres.findLast((x) => x < at - 1);
  if (to === undefined) return undefined;
  return { x: currentCoordinates.x + (to - at), y: currentCoordinates.y };
};

/**
 * A mouse drag starts after 6 px, so a click on the handle stays a click; a touch drag after a 250 ms press,
 * so a swipe still scrolls; the keyboard as above.
 */
export function useBoardSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: stepByStep }),
  );
}

const HANDLE =
  "inline-grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-2 outline-none hover:bg-panel-soft hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing pointer-coarse:size-11";

/**
 * A card's drag: `item` null leaves it still (a phone, someone who can't move, a line erp-api holds). The card
 * is the dragged node, so the overlay takes its size; the handle starts the drag.
 */
export function useCardDrag(id: string, item: DragItem | null, label: string) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id, data: item ?? undefined, disabled: !item });
  const handle = item ? (
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={label} className={HANDLE}>
      <GripVertical aria-hidden className="size-4" />
    </button>
  ) : null;
  return { setNodeRef, handle, isDragging };
}

/** One piece's handle in an open card: drags that piece alone. */
export function PieceHandle({ stepKey, line, piece }: { stepKey: string; line: StepGroup; piece: Piece }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `piece:${stepKey}:${piece.id}`, data: { stepKey, line, pieceId: piece.id } satisfies DragItem });
  return (
    <button type="button" ref={setNodeRef} {...attributes} {...listeners} aria-label={`Drag piece ${piece.label}`} className={HANDLE}>
      <GripVertical aria-hidden className="size-4" />
    </button>
  );
}

/** Where a dragged card is scrapped, when its step records a defect. */
export function ScrapZone({ open }: { open: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "scrap", disabled: !open });
  return (
    <section
      ref={setNodeRef}
      aria-label="Scrap"
      className={cn(
        "flex w-full shrink-0 snap-center flex-col items-center justify-center gap-1 self-stretch rounded-[18px] border-2 border-dashed border-lost-ink/40 p-4 text-center md:w-28",
        open && "border-lost-ink",
        isOver && "bg-lost-ink/10",
      )}
    >
      <span className="font-semibold text-lost-ink">Scrap</span>
      <span className="text-caption text-ink-2">Drop to scrap, with a defect</span>
    </section>
  );
}

/** What follows the pointer while a card or piece is dragged. */
export function DragPreview({ name, pieces }: { name: string; pieces: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-violet bg-card px-2.5 py-2 text-sm shadow-lg">
      <span className="min-w-0 truncate font-semibold text-ink tabular-nums">{name}</span>
      <HerePill count={pieces} />
    </div>
  );
}
