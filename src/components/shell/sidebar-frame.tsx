"use client";

import { cn } from "cn";
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface SidebarItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** A badge after the label; `label` is the suffix of the accessible name, like "10 need you". */
  count?: { value: number; label: string };
}

/**
 * The sidebar both areas share: the logo, the organisation box, grouped links
 * with the current one marked, and the rail's tooltips and toggle. `expanded`
 * shows labels at every width; otherwise, from 1024 to 1279 px, it is an icon
 * rail with tooltips and a button to expand it. A group with no items is left
 * out. `organisation` fills the box under the logo; its text can hide in the
 * rail with `group-data-[rail]/org:lg:max-xl:sr-only`.
 */
export function SidebarFrame({
  expanded = false,
  onToggle,
  onNavigate,
  organisation,
  groups,
  bottom,
}: {
  expanded?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  organisation: ReactNode;
  groups: { label: string; items: SidebarItem[] }[];
  bottom: SidebarItem[];
}) {
  const pathname = usePathname();
  const rail = !expanded;

  function item(link: SidebarItem) {
    const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
    const count = link.count && link.count.value > 0 ? link.count : null;
    const anchor = (
      <Link
        href={link.href}
        onClick={onNavigate}
        aria-current={current ? "page" : undefined}
        aria-label={count === null ? undefined : `${link.label}, ${count.label}`}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-ground hover:text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet",
          current && "bg-ink text-white hover:bg-ink hover:text-white",
          rail && "lg:max-xl:justify-center lg:max-xl:px-0",
        )}
      >
        <link.icon aria-hidden className="size-[18px] shrink-0" />
        <span className={cn("flex-1 truncate", rail && "lg:max-xl:sr-only")}>{link.label}</span>
        {/* A space, so the visible text reads "Orders 10", inside the name (WCAG 2.5.3). */}
        {count !== null && " "}
        {count !== null && (
          <span
            aria-hidden
            className={cn(
              "rounded-md px-1.5 text-caption tabular-nums",
              current ? "bg-white/15" : "bg-lilac text-violet-ink",
              rail && "lg:max-xl:hidden",
            )}
          >
            {count.value}
          </span>
        )}
      </Link>
    );
    if (!rail) return <li key={link.key}>{anchor}</li>;
    return (
      <li key={link.key}>
        <Tooltip>
          <TooltipTrigger asChild>{anchor}</TooltipTrigger>
          <TooltipContent side="right" className="xl:hidden">
            {count === null ? link.label : `${link.label}, ${count.label}`}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  const body = (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className={cn("flex items-center gap-2.5 px-2 pt-1", rail && "lg:max-xl:justify-center lg:max-xl:px-0")}>
        <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-ink text-sm font-bold text-white">
          A
        </span>
        <span className={cn("font-semibold", rail && "lg:max-xl:sr-only")}>AMI</span>
      </div>

      <div
        data-rail={rail ? "" : undefined}
        className={cn(
          "group/org flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2",
          rail && "lg:max-xl:justify-center lg:max-xl:border-0 lg:max-xl:px-0",
        )}
      >
        {organisation}
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {groups.map((group) =>
          group.items.length ? (
            <div key={group.label} className="flex flex-col gap-1">
              <p className={cn("px-3 text-caption font-medium uppercase tracking-wide text-ink-2", rail && "lg:max-xl:sr-only")}>
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">{group.items.map(item)}</ul>
            </div>
          ) : null,
        )}
        {bottom.length > 0 && <ul className="mt-auto flex flex-col gap-0.5">{bottom.map(item)}</ul>}
      </nav>

      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="hidden min-h-11 items-center justify-center rounded-xl text-ink-2 hover:bg-ground hover:text-ink focus-visible:outline-2 focus-visible:outline-violet lg:flex xl:hidden"
        >
          {expanded ? <PanelLeftClose aria-hidden className="size-[18px]" /> : <PanelLeftOpen aria-hidden className="size-[18px]" />}
          <span className="sr-only">{expanded ? "Collapse sidebar" : "Expand sidebar"}</span>
        </button>
      )}
    </div>
  );
  return <TooltipProvider>{body}</TooltipProvider>;
}
