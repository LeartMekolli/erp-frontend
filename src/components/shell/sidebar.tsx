"use client";

import { useMe } from "@/components/session/session-gate";
import { can } from "@/lib/auth/permissions";
import { initials } from "@/lib/format/initials";
import { useOrderCounts } from "@/lib/orders/queries";

import { visibleNav, type NavLink } from "./nav";
import { SidebarFrame, type SidebarItem } from "./sidebar-frame";

const GROUPS = [
  { name: "work", label: "Work" },
  { name: "setup", label: "Setup" },
] as const;

/** The staff sidebar: the shared frame, filled with this person's links and the workspace. */
export function Sidebar({
  expanded = false,
  onToggle,
  onNavigate,
}: {
  expanded?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const { data: me } = useMe();
  const counts = useOrderCounts({}, can(me, "order.read"));
  if (!me) return null;

  const links = visibleNav(me);
  const needYou = counts.data?.needs_you.total ?? 0;

  const toItem = (link: NavLink): SidebarItem => ({
    key: link.section,
    label: link.label,
    href: link.href,
    icon: link.icon,
    ...(link.section === "orders" && needYou > 0 ? { count: { value: needYou, label: `${needYou} need you` } } : {}),
  });
  const inGroup = (name: NavLink["group"]) => links.filter((link) => link.group === name).map(toItem);

  return (
    <SidebarFrame
      expanded={expanded}
      onToggle={onToggle}
      onNavigate={onNavigate}
      organisation={
        <>
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-lilac text-caption font-semibold text-violet-ink">
            {initials(me.workspace.name)}
          </span>
          <span className="truncate text-sm font-medium group-data-[rail]/org:lg:max-xl:sr-only">{me.workspace.name}</span>
        </>
      }
      groups={GROUPS.map((group) => ({ label: group.label, items: inGroup(group.name) }))}
      bottom={inGroup("bottom")}
    />
  );
}
