"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { StaffHome } from "@/components/session/landing";
import { useMe } from "@/components/session/session-gate";

import { firstAllowedHref } from "./nav";

/** The staff home: straight on to Orders, or the first section this person may open. */
export function StaffLanding() {
  const router = useRouter();
  const { data: me } = useMe();
  const target = me ? firstAllowedHref(me) : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (!me || target) return null;
  return <StaffHome />;
}
