/**
 * Production's History: how a move across every line reads, how long ago it was, and the filters it is
 * asked for with (`GET /workflow/moves`, erp-api `moveListQuerySchema`). Days are the workspace's: a range
 * starts at that zone's midnight, never the browser's.
 */

import type { GroupSummary, MoveActor, MoveListItem, MoveListQueryParams } from "@/lib/api/schema-types";
import { addDays, resolveRange, type RangeChoice } from "@/lib/dashboard/range";
import { dayStartIso, formatTime } from "@/lib/format/dates";

/** The result switch: every move, or only passes, fails (sent back, scrapped, let through) or corrections. */
export type HistoryResult = "all" | "pass" | "fail" | "correction";

export interface HistoryFilters {
  workflowId: string;
  stepKey: string | null;
  result: HistoryResult;
  defectKey: string | null;
  actorId: string | null;
  q: string | null;
  range: RangeChoice;
}

/** What History opens on, a reload too: every result over the last 7 days. */
export const DEFAULT_HISTORY: Omit<HistoryFilters, "workflowId"> = {
  stepKey: null,
  result: "all",
  defectKey: null,
  actorId: null,
  q: null,
  range: { preset: "7d" },
};

/** The query for the filters, `today` being the workspace's date: `from` inclusive, `to` the start of the day after. */
export function moveListQuery(filters: HistoryFilters, today: string, timeZone: string): MoveListQueryParams {
  const { from, to } = resolveRange(filters.range, today);
  return {
    workflow_id: filters.workflowId,
    ...(filters.stepKey ? { step_key: filters.stepKey } : {}),
    ...(filters.result !== "all" ? { kind: filters.result } : {}),
    ...(filters.defectKey ? { defect_key: filters.defectKey } : {}),
    ...(filters.actorId ? { actor_user_id: filters.actorId } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    from: dayStartIso(from, timeZone),
    to: dayStartIso(addDays(to, 1), timeZone),
  };
}

/** How many filters are set, for the phone's "Filters · 2": the result switch is always on screen, so it isn't counted. */
export function setFilterCount(filters: HistoryFilters): number {
  const range = "preset" in filters.range && filters.range.preset === "7d" ? 0 : 1;
  return [filters.stepKey, filters.defectKey, filters.actorId, filters.q].filter((value) => value !== null).length + range;
}

/** What a move did: "passed", "failed: Porosity, sent back to Casting", "scrapped: Crack", "corrected to Plating"… */
export function moveWords(move: Pick<MoveListItem, "kind" | "outcome" | "defect" | "to_step" | "inspected">): string {
  const defect = move.defect ? `: ${move.defect.name}` : "";
  switch (move.kind) {
    case "pass":
      return move.inspected ? "passed" : "passed without inspection";
    case "correction":
      return move.to_step ? `corrected to ${move.to_step.name}` : "corrected";
    case "fail":
      if (move.outcome === "scrap") return `scrapped${defect}`;
      if (move.outcome === "continue") return `let through${defect}`;
      return `failed${defect}, sent back${move.to_step ? ` to ${move.to_step.name}` : ""}`;
  }
}

const MINUTE = 60_000;

/** "Just now" under a minute, "10 min ago" under an hour, then the clock time in the workspace's zone. */
export function moveTime(iso: string, now: number, timeZone: string): string {
  const ago = now - Date.parse(iso);
  if (ago < MINUTE) return "Just now";
  if (ago < 60 * MINUTE) return `${Math.floor(ago / MINUTE)} min ago`;
  return formatTime(iso, timeZone);
}

/** What a line is called: "#1042", a remake "Claim #12", else its product (staff who can't read orders), else "A quote". */
export function lineName(group: GroupSummary): string {
  if (group.claim) return `Claim #${group.claim.number}`;
  if (group.order) return `#${group.order.number}`;
  return group.product?.name ?? "A quote";
}

/** Each partner the move counted for, once, in the order of its lines. */
export function partnersOf(move: Pick<MoveListItem, "groups">): string[] {
  return [...new Set(move.groups.flatMap((line) => (line.partner ? [line.partner.name] : [])))];
}

/** A person in the Person filter: "Ana Novak", or "Ana Novak · Northcast Foundry" for a workshop's. */
export function actorLabel(actor: MoveActor): string {
  return actor.partners.length > 0 ? `${actor.name} · ${actor.partners.map((partner) => partner.name).join(", ")}` : actor.name;
}
