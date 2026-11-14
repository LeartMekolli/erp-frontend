"use client";

import { notFound, useParams } from "next/navigation";

import { ComingSoon } from "@/components/shell/coming-soon";

import { partnerHref, partnerSectionLabel } from "./nav";

/** Every partner section not built yet; an unknown one is not found. */
export function PartnerSectionPage() {
  const { partnerId, section } = useParams<{ partnerId: string; section: string }>();
  const label = partnerSectionLabel(section);
  if (!label) notFound();
  return <ComingSoon title={label} back={{ href: partnerHref(partnerId, "jobs"), label: "Back to Jobs" }} />;
}
