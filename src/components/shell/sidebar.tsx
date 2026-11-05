"use client";

import { cn } from "cn";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useMe } from "@/components/session/session-gate";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { can } from "@/lib/auth/permissions";
import { initials } from "@/lib/format/initials";
import { useOrderCounts } from "@/lib/orders/queries";

import { visibleNav, type NavLink } from "./nav";

const GROUP_LABEL: Partial<Record<NavLink["group"], string>> = { work: "Work", setup: "Setup" };

/**
 * The staff sidebar. `expanded` shows labels at every width; otherwise, from
 * 1024 to 1279 px, it is an icon rail with tooltips and a button to expand it.
 */
export function Sidebar({
  expanded = false,
  onToggle,
  onNavigate,
}: {
  expanded?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const counts = useOrderCounts({}, can(me, "order.read"));
  if (!me) return null;

  const links = visibleNav(me);
  const needYou = counts.data?.needs_you.total ?? 0;
  const rail = !expanded;

  function item(link: NavLink) {
    const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
    const count = link.section === "orders" && needYou > 0 ? needYou : null;
    const anchor = (
      <Link
        href={link.href}
        onClick={onNavigate}
        aria-current={current ? "page" : undefined}
        aria-label={count === null ? undefined : `${link.label}, ${count} need you`}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-ground hover:text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet",
          current && "bg-ink text-white hover:bg-ink hover:text-white",
          rail && "lg:max-xl:justify-center lg:max-xl:px-0",
        )}
      >
        <link.icon aria-hidden className="size-[18px] shrink-0" />
        <span className={cn("flex-1 truncate", rail && "lg:max-xl:sr-only")}>{link.label}</span>
        {count !== null && (
          <span
            aria-hidden
            className={cn(
              "rounded-md px-1.5 text-caption tabular-nums",
              current ? "bg-white/15" : "bg-lilac text-violet-ink",
              rail && "lg:max-xl:hidden",
            )}
          >
            {count}
          </span>
        )}
      </Link>
    );
    if (!rail) return <li key={link.section}>{anchor}</li>;
    return (
      <li key={link.section}>
        <Tooltip>
          <TooltipTrigger asChild>{anchor}</TooltipTrigger>
          <TooltipContent side="right" className="xl:hidden">
            {count === null ? link.label : `${link.label}, ${count} need you`}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  const group = (name: NavLink["group"]) => links.filter((link) => link.group === name);

  const body = (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className={cn("flex items-center gap-2.5 px-2 pt-1", rail && "lg:max-xl:justify-center lg:max-xl:px-0")}>
        <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-ink text-sm font-bold text-white">
          A
        </span>
        <span className={cn("font-semibold", rail && "lg:max-xl:sr-only")}>AMI</span>
      </div>

      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2",
          rail && "lg:max-xl:justify-center lg:max-xl:border-0 lg:max-xl:px-0",
        )}
      >
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-lilac text-caption font-semibold text-violet-ink">
          {initials(me.workspace.name)}
        </span>
        <span className={cn("truncate text-sm font-medium", rail && "lg:max-xl:sr-only")}>{me.workspace.name}</span>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {(["work", "setup"] as const).map((name) =>
          group(name).length ? (
            <div key={name} className="flex flex-col gap-1">
              <p className={cn("px-3 text-caption font-medium uppercase tracking-wide text-ink-2", rail && "lg:max-xl:sr-only")}>
                {GROUP_LABEL[name]}
              </p>
              <ul className="flex flex-col gap-0.5">{group(name).map(item)}</ul>
            </div>
          ) : null,
        )}
        {group("bottom").length > 0 && <ul className="mt-auto flex flex-col gap-0.5">{group("bottom").map(item)}</ul>}
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
