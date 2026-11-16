"use client";

import { useMe } from "@/components/session/session-gate";
import { usePartnerMe } from "@/components/session/use-partner-me";
import type { MeResponse, PartnerRole, Permission } from "@/lib/api/schema-types";

/**
 * Whether this person may do something, so links and actions they can't use
 * don't appear. Staff only: partners and customers hold no staff permissions,
 * whatever a stale list says. erp-api still decides; this only hides.
 */
export function can(me: MeResponse | undefined, permission: Permission): boolean {
  return me?.kind === "staff" && me.permissions.includes(permission);
}

export function useCan(permission: Permission): boolean {
  return can(useMe().data, permission);
}

const PLACE_ORDER_PERMISSIONS = ["order.write", "quote.create", "customer.read", "catalog.read"] as const satisfies readonly Permission[];

/** Whether the New order page can work: it places, quotes, and reads customers and the catalog. */
export function canPlaceOrders(me: MeResponse | undefined): boolean {
  return PLACE_ORDER_PERMISSIONS.every((permission) => can(me, permission));
}

export function useCanPlaceOrders(): boolean {
  return canPlaceOrders(useMe().data);
}

/** erp-api's order of partner roles (`src/modules/partners/partner-roles.ts:2-7`). */
const PARTNER_ROLES = ["member", "admin", "owner"] as const satisfies readonly PartnerRole[];

export function partnerRoleAtLeast(role: PartnerRole, required: PartnerRole): boolean {
  return PARTNER_ROLES.indexOf(role) >= PARTNER_ROLES.indexOf(required);
}

/** This person's role at one workshop; undefined while loading or for a workshop they don't act for. */
export function usePartnerRole(partnerId: string): PartnerRole | undefined {
  return usePartnerMe().data?.partners.find((partner) => partner.id === partnerId)?.role;
}
