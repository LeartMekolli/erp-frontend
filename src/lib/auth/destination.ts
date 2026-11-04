import type { MeResponse } from "@/lib/api/schema-types";

export type Destination =
  | { kind: "staff"; path: "/" }
  | { kind: "partner"; partnerId: string; path: string }
  | { kind: "choose-partner"; partnerIds: string[]; path: "/partner-portal" }
  | { kind: "customer" }
  | { kind: "no-access" };

const partnerHome = (partnerId: string) => `/partner-portal/${partnerId}`;

/**
 * Where someone goes after sign-in, from `GET /me` (spec §4b). `kind` decides
 * the area; a partner with no workshops left, or staff with no permissions,
 * has no access.
 */
export function resolveDestination(me: MeResponse): Destination {
  switch (me.kind) {
    case "customer":
      return { kind: "customer" };
    case "partner": {
      const partnerIds = me.memberships
        .filter((m) => m.organisation_type === "partner")
        .map((m) => m.organisation_id);
      if (partnerIds.length === 1) return { kind: "partner", partnerId: partnerIds[0]!, path: partnerHome(partnerIds[0]!) };
      if (partnerIds.length > 1) return { kind: "choose-partner", partnerIds, path: "/partner-portal" };
      return { kind: "no-access" };
    }
    case "staff":
      return me.permissions.length > 0 ? { kind: "staff", path: "/" } : { kind: "no-access" };
  }
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
