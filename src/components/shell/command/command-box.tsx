"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Command, CommandInput, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api/error-message";

import { SearchResults, hasResults } from "./search-results";
import { MAX_SEARCH_LENGTH, useSearch } from "./use-search";

const PLACEHOLDER = "Search or ask a question";

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const never = () => () => {};

/**
 * ⌘K: one box that finds orders, customers, partners and help articles as
 * you type. Opens from the top bar's search button, or with ⌘K / Ctrl+K
 * anywhere unless another dialog is already open. Full screen below 768 px.
 */
export function CommandBox() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const router = useRouter();
  const mac = useSyncExternalStore(never, isMac, () => true);
  // Where focus was when ⌘K opened the box, to go back to on close.
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (!open && document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      if (!open) returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(!open);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function change(next: boolean) {
    setOpen(next);
    if (!next) setText("");
  }

  function go(href: string) {
    change(false);
    router.push(href);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) returnTo.current = null;
        change(next);
      }}
    >
      <DialogTrigger
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-violet md:flex md:h-10 md:w-72 md:items-center md:gap-2 md:border md:border-line md:bg-card md:px-3 md:text-left md:text-sm"
      >
        <Search aria-hidden className="size-5 md:size-4" />
        <span aria-hidden className="hidden flex-1 truncate md:inline">
          {PLACEHOLDER}
        </span>
        <kbd aria-hidden className="hidden rounded-md border border-line px-1.5 font-sans text-caption text-ink-2 md:inline">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          if (!returnTo.current?.isConnected) return;
          event.preventDefault();
          returnTo.current.focus();
        }}
        className="inset-0 h-dvh max-w-none translate-x-0 translate-y-0 gap-0 rounded-none p-0 pt-[env(safe-area-inset-top)] sm:max-w-none md:inset-auto md:top-[15vh] md:left-1/2 md:h-auto md:max-h-[70vh] md:max-w-xl md:-translate-x-1/2 md:rounded-xl md:pt-0"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Find orders, customers, partners and help articles.
        </DialogDescription>
        <Command shouldFilter={false} className="rounded-none! md:rounded-xl!">
          <CommandInput
            value={text}
            onValueChange={setText}
            placeholder={PLACEHOLDER}
            maxLength={MAX_SEARCH_LENGTH}
            className="text-base md:text-sm"
          />
          <CommandList className="max-h-none flex-1 md:max-h-[60vh]">
            <Answer text={text} onGo={go} />
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Message({ children }: { children: string }) {
  return <p className="px-3 py-6 text-center text-sm text-ink-2">{children}</p>;
}

function Answer({ text, onGo }: { text: string; onGo: (href: string) => void }) {
  const search = useSearch(text);

  if (!text.trim()) return <Message>Type to search orders, customers, partners and help.</Message>;
  if (search.isError && search.settled) return <Message>{errorMessage(search.error)}</Message>;
  if (!search.data) return null;
  if (!hasResults(search.data)) {
    return search.settled ? <Message>{`Nothing matches "${text.trim()}".`}</Message> : null;
  }
  return <SearchResults results={search.data} onGo={onGo} />;
}
