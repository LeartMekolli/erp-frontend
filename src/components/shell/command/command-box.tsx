"use client";

import { Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import { useMe } from "@/components/session/session-gate";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api/error-message";
import type { SearchResponse } from "@/lib/api/schema-types";
import { can } from "@/lib/auth/permissions";

import { AskAnswer } from "./ask-answer";
import { SearchResults, firstResultKey, hasResults } from "./search-results";
import { MAX_QUESTION_LENGTH, useAsk } from "./use-ask";
import { MAX_SEARCH_LENGTH, searchText, useSearch } from "./use-search";

const PLACEHOLDER = "Search or ask a question";
/** The Ask AI row's value in cmdk's selection. */
const ASK = "ask-ai";

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const never = () => () => {};

/**
 * ⌘K: one box that finds orders, customers, partners and help articles as
 * you type, and asks the AI a question. Opens from the top bar's search
 * button, or with ⌘K / Ctrl+K anywhere unless another dialog is already
 * open. Full screen below 768 px.
 */
export function CommandBox() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const mac = useSyncExternalStore(never, isMac, () => true);
  // Where focus was when ⌘K opened the box, to go back to on close.
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (!open && document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      if (!open) returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(!open);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) returnTo.current = null;
        setOpen(next);
      }}
    >
      <DialogTrigger
        // Holds the text it shows (WCAG 2.5.3), so voice control can name it.
        aria-label={`${PLACEHOLDER} ${mac ? "⌘K" : "Ctrl K"}`}
        aria-keyshortcuts="Meta+K Control+K"
        className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-violet md:flex md:h-10 md:w-72 md:items-center md:gap-2 md:border md:border-line md:bg-card md:px-3 md:text-left md:text-sm"
      >
        <Search aria-hidden className="size-5 md:size-4" />
        <span aria-hidden className="hidden flex-1 truncate md:inline">
          {PLACEHOLDER}
        </span>{" "}
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
          Find orders, customers, partners and help articles, or ask a question.
        </DialogDescription>
        <Panel onGo={go} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** The box's contents; mounted only while it's open, so closing starts afresh. */
function Panel({ onGo, onClose }: { onGo: (href: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const { data: me } = useMe();
  const search = useSearch(text);
  const ask = useAsk();
  // The person's pick among these results; a new answer selects its first row again.
  const [picked, setPicked] = useState<{ value: string; for: SearchResponse | undefined }>({ value: "", for: undefined });

  const question = text.trim();
  const mayAsk = can(me, "ai.use") && question.length > 0;
  const tooLong = question.length > MAX_QUESTION_LENGTH;
  const first = (search.data && firstResultKey(search.data)) ?? (mayAsk ? ASK : "");
  const value = picked.for === search.data && picked.value ? picked.value : first;
  const { message, showResults } = searchState(text, search);

  function askNow() {
    if (!mayAsk || tooLong) return;
    setAsked(question);
    ask.ask(question);
  }

  function edit(next: string) {
    setText(next);
    if (asked !== null) {
      setAsked(null);
      ask.reset();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      askNow();
    }
  }

  return (
    <Command
      shouldFilter={false}
      value={value}
      onValueChange={(next) => setPicked({ value: next, for: search.data })}
      onKeyDown={onKeyDown}
      className="rounded-none! md:rounded-xl!"
    >
      <CommandInput value={text} onValueChange={edit} placeholder={PLACEHOLDER} className="text-base md:text-sm" />
      {/* The listbox holds only options; messages and answers sit beside it, as a listbox may hold nothing else. */}
      <div className="no-scrollbar max-h-none flex-1 overflow-y-auto md:max-h-[60vh]">
        {asked !== null ? (
          <AskAnswer question={asked} ask={ask} onGo={onClose} />
        ) : (
          <>
            {message && <Message>{message}</Message>}
            <CommandList className="max-h-none overflow-visible">
              {showResults && search.data && <SearchResults results={search.data} onGo={onGo} />}
              {mayAsk && (
                <CommandGroup>
                  <CommandItem value={ASK} disabled={tooLong} onSelect={askNow} className="min-h-11">
                    <Sparkles aria-hidden className="text-violet" />
                    <span className="truncate">{`Ask AI: "${question}"`}</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
            {mayAsk && tooLong && (
              <p className="px-4 pb-2 text-caption text-ink-2">Questions can be up to {MAX_QUESTION_LENGTH} characters.</p>
            )}
          </>
        )}
      </div>
    </Command>
  );
}

function Message({ children }: { children: string }) {
  return <p className="px-3 py-6 text-center text-sm text-ink-2">{children}</p>;
}

/** What the search shows for `text`: a message, its results, or nothing yet. */
function searchState(text: string, search: ReturnType<typeof useSearch>): { message: string | null; showResults: boolean } {
  const none = { message: null, showResults: false };
  if (!text.trim()) return { message: "Type to search orders, customers, partners and help.", showResults: false };
  // Past search's limit the text can only be a question.
  if (searchText(text).length > MAX_SEARCH_LENGTH) return none;
  if (search.isError && search.settled) return { message: errorMessage(search.error), showResults: false };
  if (!search.data) return none;
  if (!hasResults(search.data)) return search.settled ? { message: `Nothing matches "${text.trim()}".`, showResults: false } : none;
  return { message: null, showResults: true };
}
