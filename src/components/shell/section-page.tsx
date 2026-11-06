"use client";

import { notFound, useParams } from "next/navigation";

import { useMe } from "@/components/session/session-gate";

import { ComingSoon } from "./coming-soon";
import { navAllows, sectionLabel } from "./nav";

/** Every staff section not built yet; unknown ones, and ones this person can't use, are not found. */
export function SectionPage() {
  const { section } = useParams<{ section: string }>();
  const { data: me } = useMe();
  if (!me) return null;
  const label = sectionLabel(section);
  if (!label || !navAllows(me, section)) notFound();
  return <ComingSoon title={label} />;
}
