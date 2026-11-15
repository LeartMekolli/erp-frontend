import type { FeedEntry, PartnerRole } from "@/lib/api/schema-types";
import { partnerRoleAtLeast } from "@/lib/auth/permissions";

import { jobHref } from "./offer-actions";
import { partnerHref } from "./nav";

/**
 * The page a partner's notification opens: the job it's about, under the workshop that holds it, or Jobs
 * when it names none; a payout opens that workshop's Earnings, for its admins and owners. A member may
 * still hold a payout notice from before erp-api sent them to admins only: theirs opens nothing.
 * Nothing for anything else.
 */
export function partnerSubjectHref(
  entry: Pick<FeedEntry, "subject" | "job" | "payout">,
  partnerId: string,
  roleAt: (partnerId: string) => PartnerRole | undefined,
): string | null {
  if (entry.job) return jobHref(entry.job.partner_id, entry.job.id);
  if (entry.payout) {
    const role = roleAt(entry.payout.partner_id);
    return role && partnerRoleAtLeast(role, "admin") ? partnerHref(entry.payout.partner_id, "earnings") : null;
  }
  return entry.subject.type === "job_assignment" ? partnerHref(partnerId, "jobs") : null;
}
