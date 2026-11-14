"use client";

import type { ReactNode } from "react";

import { AppShell } from "./app-shell";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/**
 * The staff frame. A client component, because the shell takes render
 * functions and a server layout can't pass those across.
 */
export function StaffShell({ children }: { children: ReactNode }) {
  return (
    <AppShell
      sidebar={(props) => <Sidebar {...props} />}
      topBar={(onOpenMenu) => <TopBar onOpenMenu={onOpenMenu} />}
    >
      {children}
    </AppShell>
  );
}
