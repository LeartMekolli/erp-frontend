"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useMe } from "@/components/session/session-gate";
import { LeaveDialog } from "@/components/new-order/leave-dialog";
import { useLeaveGuard } from "@/components/new-order/use-leave-guard";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { leaveArrivalNote } from "@/lib/navigation/arrival-note";

import { CreateCustomerButton, NewCustomerForm, type CreateState } from "./new-customer-form";

/** Any open dialog: ⌘Enter leaves it to its own buttons. */
const OPEN_DIALOG = "[role=dialog], [role=alertdialog]";

/**
 * ⌘Enter (Ctrl+Enter elsewhere) presses Create from anywhere on the page. It does nothing when something
 * else handled the key, while a dialog is open, while creating, or for a held key's repeats.
 */
function useCreateShortcut({ creating, create }: CreateState): void {
  // The listener is added once and reads the state of the last commit.
  const latest = useRef({ creating, create });
  useLayoutEffect(() => {
    latest.current = { creating, create };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      if (event.defaultPrevented || event.repeat) return;
      if (document.querySelector(OPEN_DIALOG) !== null) return;
      if (latest.current.creating) return;
      event.preventDefault();
      latest.current.create();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** The sticky bar: the note on a desktop, and Create. It also owns the ⌘Enter shortcut, as it holds Create. */
function CreateBar(state: CreateState) {
  useCreateShortcut(state);
  return (
    <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-[20px] bg-card py-3 pr-3 pl-5 shadow-[0_-8px_24px_-12px_rgb(22_20_28/0.12),0_0_0_1px_var(--color-line)] max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:rounded-b-none max-md:px-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <p className="flex-1 text-caption text-ink-2 max-md:hidden">Everything is saved together when you press Create.</p>
      <CreateCustomerButton {...state} className="min-h-11 max-md:flex-1" />
    </div>
  );
}

/** `/customers/new`: staff make a customer, its addresses and its first person in one go. */
export function NewCustomerPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "customer.write")) notFound();
  return <NewCustomer />;
}

function NewCustomer() {
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty);

  return (
    // On a phone the Create bar is fixed over the bottom of the screen: the padding lets the last panel
    // scroll clear of it, and the scroll margin keeps a field brought into view by Tab from sitting under it.
    <div className="flex w-full flex-col gap-3.5 max-md:pb-20 max-md:[&_:is(input,select,textarea,button,a)]:scroll-mb-24">
      <header className="flex flex-col gap-3 pt-1">
        {/* Same-site links: the leave guard asks first when something is entered. */}
        <Link href="/customers" className="inline-flex min-h-11 items-center gap-1 self-start font-medium text-ink-2 hover:text-ink max-md:hidden md:min-h-0">
          <ChevronLeft aria-hidden className="size-4" />
          Customers
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-title font-semibold">New customer</h1>
          <Button asChild variant="outline" className="ml-auto min-h-11 rounded-full">
            <Link href="/customers">Cancel</Link>
          </Button>
        </div>
      </header>

      <NewCustomerForm
        layout="page"
        onDirtyChange={setDirty}
        onCreated={(customer) => {
          const page = `/customers/${customer.id}`;
          leaveArrivalNote(page, { created: { invitation: customer.invitation } });
          guard.leaveNow(page);
        }}
        footer={(state) => <CreateBar {...state} />}
      />

      <LeaveDialog open={guard.dialog.open} leave={guard.dialog.leave} stay={guard.dialog.stay} title="Leave without creating?" />
    </div>
  );
}
