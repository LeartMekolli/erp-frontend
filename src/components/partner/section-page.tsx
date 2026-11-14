"use client";

import { notFound, useParams } from "next/navigation";

import { ComingSoon } from "@/components/shell/coming-soon";

import { partnerHref, partnerSectionLabel } from "./nav";

/**
 * Every partner section not built yet; an unknown one is not found. So is any
 * address under Jobs that isn't Jobs or a Job page, which lands here too.
 */
export function PartnerSectionPage() {
  const { partnerId, section } = useParams<{ partnerId: string; section: string }>();
  const label = partnerSectionLabel(section);
  if (!label || section === "jobs") notFound();
  return <ComingSoon title={label} back={{ href: partnerHref(partnerId, "jobs"), label: "Back to Jobs" }} />;
}
