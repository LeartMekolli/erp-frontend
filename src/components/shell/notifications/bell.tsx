"use client";

import { Bell as BellIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";

import { ListEnd } from "@/components/data/list-end";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { errorMessage } from "@/lib/api/error-message";
import type { FeedEntry } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { useMediaQuery } from "@/lib/use-media-query";

import { useFeed, useMarkAllRead, useMarkRead, useUnreadCount } from "./queries";

const TITLE = "Notifications";

/**
 * The bell in the top bar: how many are unread, and the panel of
 * notifications, a popover from 768 px and full screen below. Opening one
 * marks it read and goes to its record, when there is one to go to.
 */
export function Bell({ hrefFor }: { hrefFor: (entry: FeedEntry) => string | null }) {
  const { data: me } = useMe();
  const unread = useUnreadCount();
  const wide = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const markRead = useMarkRead();
  const router = useRouter();
  const titleId = useId();
  // The panel's dates need /me (useFormat), so wait for it.
  if (!me) return null;

  async function choose(entry: FeedEntry) {
    if (entry.read_at === null) {
      try {
        await markRead.mutateAsync(entry.id);
      } catch {
        // Still unread, so the count stays; going to the record matters more.
      }
    }
    const href = hrefFor(entry);
    if (!href) return;
    setOpen(false);
    router.push(href);
  }

  const trigger = (
    <button
      type="button"
      className="relative grid size-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-violet"
    >
      <BellIcon aria-hidden className="size-5" />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet px-1 text-[10px] font-semibold text-white tabular-nums ring-2 ring-ground"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      <span className="sr-only">{unread > 0 ? `${TITLE}, ${unread} unread` : TITLE}</span>
    </button>
  );

  if (wide) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          aria-labelledby={titleId}
          className="max-h-[min(36rem,calc(100dvh-5rem))] w-96 gap-0 overflow-hidden rounded-xl p-0"
        >
          <PanelHeader unread={unread} className="px-4">
            <h2 id={titleId} className="text-sm font-semibold text-ink">
              {TITLE}
            </h2>
          </PanelHeader>
          <Feed onChoose={choose} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="gap-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-none"
      >
        <SheetHeader className="p-0">
          {/* Clear of the sheet's close button in the corner. */}
          <PanelHeader unread={unread} className="pr-16 pl-4">
            <SheetTitle className="text-sm font-semibold text-ink">{TITLE}</SheetTitle>
          </PanelHeader>
        </SheetHeader>
        <Feed onChoose={choose} />
      </SheetContent>
    </Sheet>
  );
}

/** The panel's title, with "Mark all as read" while anything is unread and a line when it fails. */
function PanelHeader({ unread, className, children }: { unread: number; className: string; children: ReactNode }) {
  const markAll = useMarkAllRead();
  return (
    <div className={`flex flex-col gap-1 border-b border-line py-1.5 ${className}`}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        {children}
        {unread > 0 && (
          <Button variant="ghost" className="-mr-3 px-3" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all as read
          </Button>
        )}
      </div>
      {markAll.isError && (
        <p role="alert" className="pb-1.5 text-caption text-ink-2">
          {errorMessage(markAll.error)}
        </p>
      )}
    </div>
  );
}

function Feed({ onChoose }: { onChoose: (entry: FeedEntry) => void }) {
  const feed = useFeed();
  const format = useFormat();

  if (feed.isPending) {
    return (
      <p role="status" className="px-4 py-6 text-sm text-ink-2">
        Loading notifications…
      </p>
    );
  }

  if (feed.items.length === 0 && feed.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-6">
        <p className="text-sm text-ink-2">{errorMessage(feed.error)}</p>
        <Button variant="secondary" onClick={() => void feed.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (feed.items.length === 0) {
    return <p className="px-4 py-6 text-sm text-ink-2">You&apos;re all caught up.</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <ul className="divide-y divide-line">
        {feed.items.map((entry) => {
          const unread = entry.read_at === null;
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onChoose(entry)}
                className="flex min-h-11 w-full gap-3 px-4 py-3 text-left hover:bg-ground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
              >
                <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? "bg-violet" : ""}`} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={`text-sm text-ink ${unread ? "font-semibold" : "font-medium"}`}>{entry.title}</span>
                  {unread && <span className="sr-only">Unread</span>}
                  <span className="line-clamp-2 text-sm text-ink-2">{entry.body}</span>
                  <time dateTime={entry.created_at} className="text-caption text-ink-2">
                    {format.dateTime(entry.created_at)}
                  </time>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="px-4">
        <ListEnd list={feed} />
      </div>
    </div>
  );
}
