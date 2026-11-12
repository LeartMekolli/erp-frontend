"use client";

import { cn } from "cn";
import { useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/**
 * The frame of every page in both areas: the sidebar (full from 1280 px, an
 * icon rail from 1024, a drawer below), the top bar, an optional banner, and
 * the page. Each area passes its own sidebar and top bar.
 */
export function AppShell({
  sidebar,
  topBar,
  banner,
  children,
}: {
  sidebar: (props: { expanded: boolean; onToggle?: () => void; onNavigate?: () => void }) => ReactNode;
  topBar: (onOpenMenu: () => void) => ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex min-h-dvh pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-card lg:block",
          expanded ? "w-60" : "w-[76px] xl:w-60",
        )}
      >
        {sidebar({ expanded, onToggle: () => setExpanded((open) => !open) })}
      </aside>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] bg-card p-0 lg:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {sidebar({ expanded: true, onNavigate: () => setDrawerOpen(false) })}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {topBar(() => setDrawerOpen(true))}
        {banner}
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col gap-4 px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none sm:px-5 max-md:has-[[data-move-bar]]:pb-40">
          {children}
        </main>
      </div>
    </div>
  );
}
