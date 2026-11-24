import type { FeedEntry, MeResponse } from "@/lib/api/schema-types";

import { navAllows } from "../nav";

import type { Destination } from "./bell";

/** Where each kind of subject opens: its section, and whether the link names the record. */
const TARGETS: Record<string, { section: string; withId: boolean }> = {
  order: { section: "orders", withId: true },
  customer: { section: "customers", withId: true },
  customer_invitation: { section: "customers", withId: false },
  partner: { section: "partners", withId: true },
  partner_invitation: { section: "partners", withId: false },
  payout: { section: "partners", withId: false },
  job_assignment: { section: "production", withId: false },
  user: { section: "settings", withId: false },
  invitation: { section: "settings", withId: false },
  material: { section: "catalog", withId: false },
  credit_campaign: { section: "payments", withId: false },
};

/**
 * The page a notification opens, or null when it has none this person may see. A failed payout opens its
 * partner's Payouts tab (through an arrival note: the address stays plain), and the weekly payouts
 * reminder (about the workspace) opens Partners.
 */
export function subjectHref(entry: Pick<FeedEntry, "subject" | "payout" | "event_key">, me: MeResponse): Destination | null {
  if (navAllows(me, "partners")) {
    if (entry.payout) return { href: `/partners/${encodeURIComponent(entry.payout.partner_id)}`, note: { partnerTab: "payouts" } };
    if (entry.event_key === "payouts.reminder") return { href: "/partners" };
  }
  const href = plainHref(entry.subject, me);
  return href ? { href } : null;
}

function plainHref(subject: { type: string; id: string }, me: MeResponse): string | null {
  const target = TARGETS[subject.type];
  if (!target || !navAllows(me, target.section)) return null;
  return target.withId ? `/${target.section}/${encodeURIComponent(subject.id)}` : `/${target.section}`;
}
