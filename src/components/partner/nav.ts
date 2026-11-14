import { BriefcaseBusiness, Gauge, House, Tag, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";

export interface PartnerNavLink {
  section: string;
  label: string;
  icon: LucideIcon;
  group: "work" | "setup";
}

/** The partner portal's sections, in sidebar order. */
export const PARTNER_NAV: readonly PartnerNavLink[] = [
  { section: "dashboard", label: "Dashboard", icon: House, group: "work" },
  { section: "jobs", label: "Jobs", icon: BriefcaseBusiness, group: "work" },
  { section: "earnings", label: "Earnings", icon: Wallet, group: "work" },
  { section: "performance", label: "Performance", icon: Gauge, group: "work" },
  { section: "setup", label: "Setup", icon: Wrench, group: "setup" },
  { section: "prices", label: "Prices", icon: Tag, group: "setup" },
  { section: "team", label: "Team", icon: Users, group: "setup" },
];

export function partnerHref(partnerId: string, section: string): string {
  return `/partner-portal/${partnerId}/${section}`;
}

/** The label of a section, or null when there is no such section. */
export function partnerSectionLabel(section: string): string | null {
  return PARTNER_NAV.find((link) => link.section === section)?.label ?? null;
}
