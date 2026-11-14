import type { FeedEntry } from "@/lib/api/schema-types";

import { jobHref } from "./offer-actions";
import { partnerHref } from "./nav";

/**
 * The page a partner's notification opens: the job it's about, under the workshop that holds it, or Jobs
 * when it names none. Nothing for anything else.
 */
export function partnerSubjectHref(entry: Pick<FeedEntry, "subject" | "job">, partnerId: string): string | null {
  if (entry.job) return jobHref(entry.job.partner_id, entry.job.id);
  return entry.subject.type === "job_assignment" ? partnerHref(partnerId, "jobs") : null;
}
