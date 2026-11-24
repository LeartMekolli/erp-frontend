"use client";

import { Menu } from "lucide-react";

import { usePartnerMe } from "@/components/session/use-partner-me";
import { Bell } from "@/components/shell/notifications/bell";
import { UserMenu } from "@/components/shell/user-menu";

import { partnerSubjectHref } from "./subject-href";
import { useWorkshop } from "./use-workshop";

/** Above every partner page: the menu (below 1024 px), notifications and the user menu. No search. */
export function PartnerTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { partnerId } = useWorkshop();
  const { data: me } = usePartnerMe();
  const roleAt = (id: string) => me?.partners.find((partner) => partner.id === id)?.role;
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-ground/90 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur sm:px-5">
      <button
        type="button"
        onClick={onOpenMenu}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-violet lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Open menu</span>
      </button>
      <div className="flex-1" />
      <Bell
        hrefFor={(entry) => {
          const href = partnerSubjectHref(entry, partnerId, roleAt);
          return href ? { href } : null;
        }}
      />
      <UserMenu />
    </header>
  );
}
