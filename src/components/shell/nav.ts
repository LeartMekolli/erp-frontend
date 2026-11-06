import {
  Building2,
  ChartColumn,
  CreditCard,
  Factory,
  FileText,
  House,
  Package,
  Settings,
  Tag,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { MeResponse, Permission } from "@/lib/api/schema-types";
import { can } from "@/lib/auth/permissions";

export interface NavLink {
  section: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: "work" | "setup" | "bottom";
  allowed: (me: MeResponse) => boolean;
}

const needs = (permission: Permission) => (me: MeResponse) => can(me, permission);
const anyOf = (...permissions: Permission[]) => (me: MeResponse) => permissions.some((p) => can(me, p));

/** The staff sidebar, in order, each link with the permission its section needs (spec §4.1). */
export const NAV: readonly NavLink[] = [
  { section: "dashboard", label: "Dashboard", href: "/dashboard", icon: House, group: "work", allowed: needs("report.read") },
  { section: "orders", label: "Orders", href: "/orders", icon: FileText, group: "work", allowed: needs("order.read") },
  { section: "production", label: "Production", href: "/production", icon: Factory, group: "work", allowed: needs("workflow.read") },
  { section: "partners", label: "Partners", href: "/partners", icon: Users, group: "work", allowed: needs("partner.read") },
  { section: "customers", label: "Customers", href: "/customers", icon: Building2, group: "work", allowed: needs("customer.read") },
  // erp-api's claims routes use the order permissions.
  { section: "claims", label: "Claims", href: "/claims", icon: TriangleAlert, group: "work", allowed: needs("order.read") },
  { section: "catalog", label: "Catalog", href: "/catalog", icon: Package, group: "setup", allowed: needs("catalog.read") },
  { section: "pricing", label: "Pricing", href: "/pricing", icon: Tag, group: "setup", allowed: needs("pricing.read") },
  { section: "payments", label: "Payments", href: "/payments", icon: CreditCard, group: "setup", allowed: needs("payment.read") },
  { section: "reports", label: "Reports", href: "/reports", icon: ChartColumn, group: "setup", allowed: needs("report.read") },
  {
    section: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
    group: "bottom",
    allowed: anyOf("settings.read", "user.read", "role.read", "template.read"),
  },
];

/** Routes with no sidebar link: help articles open from ⌘K. */
export const EXTRA_SECTIONS: Record<string, { label: string; allowed: (me: MeResponse) => boolean }> = {
  help: { label: "Help", allowed: () => true },
};

export function visibleNav(me: MeResponse): NavLink[] {
  return NAV.filter((link) => link.allowed(me));
}

/** Where staff land: Orders when they may see it, else their first link; null when none. */
export function firstAllowedHref(me: MeResponse): string | null {
  const links = visibleNav(me);
  return (links.find((link) => link.section === "orders") ?? links[0])?.href ?? null;
}

/** Whether this person may open a section's routes, by the same rule as its link. */
export function navAllows(me: MeResponse, section: string): boolean {
  const link = NAV.find((l) => l.section === section);
  if (link) return link.allowed(me);
  return EXTRA_SECTIONS[section]?.allowed(me) ?? false;
}

/** A section's name, for its page title. */
export function sectionLabel(section: string): string | null {
  return NAV.find((l) => l.section === section)?.label ?? EXTRA_SECTIONS[section]?.label ?? null;
}
