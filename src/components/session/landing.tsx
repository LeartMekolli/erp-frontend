"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { clientSession } from "@/lib/session/client-session";

import { useMe } from "./session-gate";
import { usePartnerMe } from "./use-partner-me";

function SignOutButton() {
  return (
    <Button variant="secondary" className="self-start" onClick={() => void clientSession().signOut()}>
      Sign out
    </Button>
  );
}

/** A plain landing page until the app shell arrives with the Orders screen. */
function Landing({ workspace, title, children }: { workspace: string; title: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 justify-center p-3.5 sm:p-6">
      <section className="flex w-full max-w-[560px] flex-col gap-5 self-start rounded-2xl bg-card px-6 py-7 sm:px-10">
        <p className="text-caption font-medium text-ink-2">{workspace}</p>
        <h1 className="text-title font-semibold">{title}</h1>
        {children}
        <SignOutButton />
      </section>
    </main>
  );
}

function Status({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-sm text-ink-2">
      {children}
    </p>
  );
}

export function StaffHome() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <Landing workspace={me.workspace.name} title={`Hello, ${me.user.name}`}>
      <p className="text-sm text-ink-2">You&apos;re signed in as {me.user.email}.</p>
    </Landing>
  );
}

export function PartnerChooser() {
  const { data: me } = useMe();
  const partnerMe = usePartnerMe();
  if (!me) return null;
  return (
    <Landing workspace={me.workspace.name} title="Choose a workshop">
      {partnerMe.data ? (
        <ul className="flex flex-col gap-2">
          {partnerMe.data.partners.map((partner) => (
            <li key={partner.id}>
              <Button asChild variant="secondary" className="w-full justify-start">
                <Link href={`/partner-portal/${partner.id}`}>{partner.display_name}</Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Status>{partnerMe.isError ? "Your workshops couldn't be loaded. Reload to try again." : "Loading your workshops…"}</Status>
      )}
    </Landing>
  );
}

