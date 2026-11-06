"use client";

import { LogOut } from "lucide-react";

import { useMe } from "@/components/session/session-gate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format/initials";
import { clientSession } from "@/lib/session/client-session";

/** The account button at the right of the top bar: who you are, and Sign out. */
export function UserMenu() {
  const { data: me } = useMe();
  if (!me) return null;
  const roles = me.roles.map((role) => role.name).join(", ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account: ${me.user.name}`}
        className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 text-sm font-medium hover:bg-card focus-visible:outline-2 focus-visible:outline-violet xl:pr-3"
      >
        {/* The initials are drawn by CSS, not text, so the visible text is just the name, as in "Account: Dana" (WCAG 2.5.3). */}
        <span
          aria-hidden
          data-initials={initials(me.user.name)}
          className="grid size-8 place-items-center rounded-full bg-lilac text-caption font-semibold text-violet-ink before:content-[attr(data-initials)]"
        />
        <span aria-hidden className="hidden xl:inline">
          {me.user.name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl p-1.5">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5 font-normal">
          <span className="text-sm font-semibold text-ink">{me.user.name}</span>
          <span className="truncate text-caption text-ink-2">{me.user.email}</span>
          {roles && <span className="text-caption text-ink-2">{roles}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onSelect={() => void clientSession().signOut()}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
