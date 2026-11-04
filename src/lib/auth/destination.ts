import type { MeResponse } from "@/lib/api/schema-types";

export type Destination =
  | { kind: "staff"; path: "/" }
  | { kind: "partner"; partnerId: string; path: string }
  | { kind: "choose-partner"; partnerIds: string[]; path: "/partner-portal" }
  | { kind: "customer" }
  | { kind: "no-access" };

const partnerHome = (partnerId: string) => `/partner-portal/${partnerId}`;

/**
 * Where someone goes after sign-in, from `GET /me` (spec §4b).
 *
 * erp-api's `/me` doesn't return the user's kind yet (`backend-todos.md`), so
 * this reads it from memberships. Switch to `kind` when the API adds it.
 */
export function resolveDestination(me: MeResponse): Destination {
  const partnerIds = me.memberships
    .filter((m) => m.organisation_type === "partner")
    .map((m) => m.organisation_id);
  const isCustomer = me.memberships.some((m) => m.organisation_type === "customer");

  if (partnerIds.length === 1) return { kind: "partner", partnerId: partnerIds[0]!, path: partnerHome(partnerIds[0]!) };
  if (partnerIds.length > 1) return { kind: "choose-partner", partnerIds, path: "/partner-portal" };
  if (isCustomer) return { kind: "customer" };
  if (me.memberships.length === 0 && me.permissions.length > 0) return { kind: "staff", path: "/" };
  return { kind: "no-access" };
}

/** The destination's page, or null for someone who can't use AMI. */
export function homePath(destination: Destination): string | null {
  return "path" in destination ? destination.path : null;
}

/** The home of a signed-in session, from what the session cookie remembers. */
export function homeForSession(session: { kind: "staff" | "partner"; partnerIds: string[] }): string {
  if (session.kind === "staff") return "/";
  return session.partnerIds.length === 1 ? partnerHome(session.partnerIds[0]!) : "/partner-portal";
}
