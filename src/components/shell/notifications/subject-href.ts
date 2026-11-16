import type { FeedEntry, MeResponse } from "@/lib/api/schema-types";

import { navAllows } from "../nav";

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
 * partner's Payouts tab, and the weekly payouts reminder (about the workspace) opens Partners.
 */
export function subjectHref(entry: Pick<FeedEntry, "subject" | "payout" | "event_key">, me: MeResponse): string | null {
  if (navAllows(me, "partners")) {
    if (entry.payout) return `/partners/${encodeURIComponent(entry.payout.partner_id)}?tab=payouts`;
    if (entry.event_key === "payouts.reminder") return "/partners";
  }
  return plainHref(entry.subject, me);
}

function plainHref(subject: { type: string; id: string }, me: MeResponse): string | null {
  const target = TARGETS[subject.type];
  if (!target || !navAllows(me, target.section)) return null;
  return target.withId ? `/${target.section}/${encodeURIComponent(subject.id)}` : `/${target.section}`;
}
