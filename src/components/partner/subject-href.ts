import { partnerHref } from "./nav";

/** The page a partner's notification opens: Jobs for a job, nothing for anything else. */
export function partnerSubjectHref(subject: { type: string; id: string }, partnerId: string): string | null {
  return subject.type === "job_assignment" ? partnerHref(partnerId, "jobs") : null;
}
