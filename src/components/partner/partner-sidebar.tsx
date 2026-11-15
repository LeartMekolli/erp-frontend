"use client";

import Link from "next/link";

import { SidebarFrame, type SidebarItem } from "@/components/shell/sidebar-frame";
import { partnerRoleAtLeast, usePartnerRole } from "@/lib/auth/permissions";
import { initials } from "@/lib/format/initials";

import { PARTNER_NAV, partnerHref, type PartnerNavLink } from "./nav";
import { useWorkshop } from "./use-workshop";

const GROUPS = [
  { name: "work", label: "Work" },
  { name: "setup", label: "Setup" },
] as const;

/** The partner sidebar: the shared frame, with the workshop in the box and the partner's sections. */
export function PartnerSidebar({
  expanded = false,
  onToggle,
  onNavigate,
}: {
  expanded?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const { partnerId, name, several } = useWorkshop();
  const role = usePartnerRole(partnerId);
  // A link for some roles only waits for the role, so it never shows to someone it would turn away.
  const visible = (link: PartnerNavLink) => !link.role || (role !== undefined && partnerRoleAtLeast(role, link.role));
  const items = (group: "work" | "setup"): SidebarItem[] =>
    PARTNER_NAV.filter((link) => link.group === group && visible(link)).map((link) => ({
      key: link.section,
      label: link.label,
      href: partnerHref(partnerId, link.section),
      icon: link.icon,
    }));

  return (
    <SidebarFrame
      expanded={expanded}
      onToggle={onToggle}
      onNavigate={onNavigate}
      organisation={
        <>
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-lilac text-caption font-semibold text-violet-ink">
            {initials(name ?? "")}
          </span>
          <span className="flex min-w-0 flex-col group-data-[rail]/org:lg:max-xl:sr-only">
            <span className="truncate text-sm font-medium">{name ?? "Your workshop"}</span>
            {several && (
              <Link
                href="/partner-portal"
                onClick={onNavigate}
                className="inline-flex min-h-11 items-center truncate text-caption text-ink-2 underline hover:text-ink focus-visible:outline-2 focus-visible:outline-violet"
              >
                Switch workshop
              </Link>
            )}
          </span>
        </>
      }
      groups={GROUPS.map((group) => ({ label: group.label, items: items(group.name) }))}
      bottom={[]}
    />
  );
}
