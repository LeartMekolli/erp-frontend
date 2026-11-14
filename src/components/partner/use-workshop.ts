"use client";

import { useParams } from "next/navigation";

import { usePartnerMe } from "@/components/session/use-partner-me";

/** The workshop in the route: its name and status, and whether this person works for more than one. */
export function useWorkshop(): { partnerId: string; name: string | null; suspended: boolean; several: boolean } {
  const { partnerId } = useParams<{ partnerId: string }>();
  const { data } = usePartnerMe();
  const partner = data?.partners.find((p) => p.id === partnerId);
  return {
    partnerId,
    name: partner?.display_name ?? null,
    suspended: partner?.status === "suspended",
    several: (data?.partners.length ?? 0) > 1,
  };
}
