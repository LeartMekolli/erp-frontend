"use client";

import { Menu, Plus } from "lucide-react";
import Link from "next/link";

import { useCan } from "@/lib/auth/permissions";

import { UserMenu } from "./user-menu";

const iconButton =
  "grid size-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-violet";

/** Above every staff page: the menu (below 1024 px), search, notifications and the user menu. */
export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const canCreate = useCan("order.write");
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-ground/90 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur sm:px-5">
      <button type="button" onClick={onOpenMenu} className={`${iconButton} lg:hidden`}>
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Open menu</span>
      </button>
      <div className="flex-1" />
      {canCreate && (
        <Link href="/orders/new" className={`${iconButton} md:hidden`}>
          <Plus aria-hidden className="size-5" />
          <span className="sr-only">New order</span>
        </Link>
      )}
      <UserMenu />
    </header>
  );
}
