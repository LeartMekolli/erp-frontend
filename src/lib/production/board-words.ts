import type { StepGroup } from "@/lib/api/schema-types";

import type { DropMove } from "./board";

const count = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;

/** The order (or product) a line is named by, as its card shows it. */
function nameOf(line: StepGroup): string {
  const { order, product } = line.group;
  return order ? `#${order.number}` : (product?.name ?? "This line");
}

/** dnd-kit's keyboard help, linked to every drag handle by `aria-describedby`. */
export const DRAG_INSTRUCTIONS =
  "To move this card, press Space or Enter, use the arrow keys to reach a step, then press Space or Enter again to drop it. Escape puts it back.";

export function pickedUpWords(line: StepGroup, pieces: number): string {
  return `Picked up ${nameOf(line)}, ${count(pieces)}.`;
}

/** What dropping here would do. `name` is the step (or Scrap) under the card, null when it's over none. */
export function overWords(name: string | null, move: DropMove | null): string {
  if (name === null) return "Not over a step.";
  if (!move) return `Over ${name}: can't go here.`;
  if (move.kind === "pass") return `Over ${name}: pass.`;
  return move.target.kind === "scrap" ? `Over ${name}: scrap.` : `Over ${name}: send back.`;
}

export function droppedWords(name: string | null, move: DropMove | null): string {
  if (name === null) return "Put back.";
  return move ? `Dropped on ${name}.` : `Put back. It can't go to ${name}.`;
}

export function cancelledWords(): string {
  return "Put back.";
}
