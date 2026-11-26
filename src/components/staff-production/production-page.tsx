"use client";

import { notFound } from "next/navigation";

import { StaffPhotoLinks } from "@/components/order-detail/staff-tabs";
import { Production } from "@/components/production/page/production-page";
import { useMe } from "@/components/session/session-gate";
import { can } from "@/lib/auth/permissions";

/**
 * `/production`. Reads staff's permissions here, outside `src/components/production/`, whose views partners share
 * and so take what a person may do as props.
 */
export function ProductionPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "workflow.read")) notFound();
  return (
    <StaffPhotoLinks>
      <Production canMove={can(me, "workflow.move")} canUpload={can(me, "file.write")} />
    </StaffPhotoLinks>
  );
}
