/**
 * How History words its actions, on a staff line or a partner's job. An action is one move: every piece it
 * moved, with what they share (erp-api `move-history-response.ts:21`). Each piece also carries its own
 * result, because one request can end its pieces differently, such as a restore cancelling the replacement.
 */

import type { ActionPiece } from "@/lib/api/schema-types";
import { dayKey, formatDate, formatDayMonth } from "@/lib/format/dates";

import type { Actor, MoveEntry, StepRules } from "./shape";

type LineAction = MoveEntry;
type Outcome = NonNullable<LineAction["outcome"]>;

const DONE: Record<Outcome, string> = { scrap: "Scrapped", rework: "Redone", continue: "Sent on" };
const INSTEAD: Record<Outcome, string> = { scrap: "scrapped", rework: "redone", continue: "sent on" };

const nounFor = (count: number) => `${count} ${count === 1 ? "piece" : "pieces"}`;

/** A correction that took every piece off the path: erp-api's record of a cancelled piece. */
export function isCancel(action: LineAction): boolean {
  return action.kind === "correction" && action.pieces.every((piece) => piece.status === "cancelled");
}

/** Pieces of one action that ended differently, so the title can't speak for all of them. */
export function isMixed(action: LineAction): boolean {
  const [first, ...rest] = action.pieces;
  return rest.some((piece) => piece.to_step?.id !== first?.to_step?.id || piece.status !== first?.status);
}

/** What stands out from routine passes: fails, and corrections that put pieces at a step. */
export function isNotable(action: LineAction): boolean {
  return action.kind === "fail" || (action.kind === "correction" && !isCancel(action));
}

export function actionTitle(action: LineAction): string {
  const from = action.from_step?.name;
  if (action.kind === "fail") return `Failed at ${from ?? "a step"}${action.defect ? `: ${action.defect.name}` : ""}`;
  if (action.kind === "correction") {
    if (isCancel(action)) return "Cancelled";
    if (isMixed(action) || !action.to_step) return `Corrected ${nounFor(action.pieces.length)}`;
    return `Moved to ${action.to_step.name}`;
  }
  const passed = from ? `Passed ${from} → ${action.to_step?.name ?? "Finished"}` : "Passed";
  return action.inspected ? passed : `${passed}, not inspected`;
}

/** Where a fail sent its pieces; nothing for a pass or a correction, whose title already says. */
export function nextText(action: LineAction): string | null {
  if (action.kind !== "fail") return null;
  if (action.outcome === "scrap") return "→ scrapped";
  if (action.outcome === "rework") return `→ redo at ${action.to_step?.name ?? "an earlier step"}`;
  return action.to_step ? `→ on to ${action.to_step.name}` : "→ finished";
}

/** A replacement shares its number with the piece it replaces, so it says so. */
export function pieceName(piece: ActionPiece): string {
  return piece.replacement ? `${piece.label}, replacement` : piece.label;
}

/** Where one piece of an action ended up. */
export function pieceResult(piece: ActionPiece): string {
  if (piece.status === "cancelled") return "Cancelled";
  if (piece.status === "scrapped") return "Scrapped";
  if (piece.status === "finished") return "Finished";
  return `At ${piece.to_step?.name ?? "its step"}`;
}

/**
 * Why a fail didn't follow its defect's default, against that default in the step's rules. A step or
 * defect no longer in the rules gives the reason alone.
 */
export function overrideText(
  action: Pick<LineAction, "override_reason" | "outcome" | "from_step" | "to_step" | "defect">,
  rules: StepRules[],
): string | null {
  const reason = action.override_reason;
  if (!reason) return null;
  const step = rules.find((candidate) => candidate.key === action.from_step?.key);
  const setup = step?.defects.find((defect) => defect.key === action.defect?.key);
  if (step && setup && action.outcome) {
    if (action.outcome !== setup.outcome) return `${DONE[action.outcome]} instead of ${INSTEAD[setup.outcome]}: ${reason}`;
    const usual = [...step.reworkTargets, ...rules].find((candidate) => candidate.key === setup.reworkTo)?.name;
    if (action.outcome === "rework" && action.to_step && usual && action.to_step.key !== setup.reworkTo) {
      return `Redone at ${action.to_step.name} instead of ${usual}: ${reason}`;
    }
  }
  return `Changed because: ${reason}`;
}

/**
 * Who made a move. Staff see the person, and the partner a move counted for; a partner sees its own
 * people by name, and the workspace's and another workshop's moves by kind alone.
 */
export function actorText({ actor }: { actor: Actor }): string {
  switch (actor.kind) {
    case "staff":
      return actor.forPartner ? `${actor.name}, for ${actor.forPartner}` : (actor.name ?? "");
    case "own":
      return actor.name ?? "";
    case "workspace":
      return "Workspace";
    case "other_partner":
      return "Another workshop";
  }
}

/** The calendar day before a `YYYY-MM-DD` key, by the calendar rather than 24 hours, which clock changes break. */
function dayBefore(key: string): string {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** Items under their day in the workspace's zone, keeping the list's order: "Today", "Yesterday, 11 Nov", then dates. */
export function groupByDay<T extends { created_at: string }>(actions: T[], now: number, timeZone: string): { key: string; heading: string; actions: T[] }[] {
  const today = dayKey(new Date(now).toISOString(), timeZone);
  const yesterday = dayBefore(today);
  const days: { key: string; heading: string; actions: T[] }[] = [];
  for (const action of actions) {
    const key = dayKey(action.created_at, timeZone);
    const last = days.at(-1);
    if (last?.key === key) {
      last.actions.push(action);
      continue;
    }
    const heading =
      key === today
        ? "Today"
        : key === yesterday
          ? `Yesterday, ${formatDayMonth(action.created_at, timeZone)}`
          : key.slice(0, 4) === today.slice(0, 4)
            ? formatDayMonth(action.created_at, timeZone)
            : formatDate(action.created_at, timeZone);
    days.push({ key, heading, actions: [action] });
  }
  return days;
}
