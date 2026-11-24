import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { AUTH_NOTE_COOKIE, parseAuthNote } from "@/lib/auth/auth-note";
import { homeForSession } from "@/lib/auth/destination";
import { WORKSPACE_HINT_COOKIE } from "@/lib/routes";
import { checkLimits } from "@/lib/session/limits";
import { SESSION_COOKIE, openSession } from "@/lib/session/server-session";

export const metadata: Metadata = { title: "Sign in · AMI" };

/** The home of a live session in this browser, or null. */
async function signedInHome(cookie: string | undefined): Promise<string | null> {
  const session = await openSession(cookie);
  return session && checkLimits(session, Date.now()) === "ok" ? homeForSession(session) : null;
}

/** Always plain `/sign-in`: why, where back to and which workspace come in the auth note. */
export default async function SignInPage() {
  const store = await cookies();
  const note = parseAuthNote(store.get(AUTH_NOTE_COOKIE)?.value);

  // One workspace per browser: someone signed in goes home. Not right after a
  // sign-out, whose cookie may not be cleared yet.
  if (!note.reason) {
    const home = await signedInHome(store.get(SESSION_COOKIE)?.value);
    if (home) redirect(home);
  }

  return (
    <SignInForm
      initialWorkspace={note.workspace ?? store.get(WORKSPACE_HINT_COOKIE)?.value ?? ""}
      next={note.next ?? null}
      reason={note.reason ?? null}
    />
  );
}
