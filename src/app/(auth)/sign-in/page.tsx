import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { homeForSession } from "@/lib/auth/destination";
import { WORKSPACE_HINT_COOKIE } from "@/lib/routes";
import { checkLimits } from "@/lib/session/limits";
import { SESSION_COOKIE, openSession } from "@/lib/session/server-session";

export const metadata: Metadata = { title: "Sign in · AMI" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** The home of a live session in this browser, or null. */
async function signedInHome(cookie: string | undefined): Promise<string | null> {
  const session = await openSession(cookie);
  return session && checkLimits(session, Date.now()) === "ok" ? homeForSession(session) : null;
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const store = await cookies();
  const reason = first(params.reason);

  // One workspace per browser: someone signed in goes home. Not right after a
  // sign-out, whose cookie may not be cleared yet.
  if (!reason) {
    const home = await signedInHome(store.get(SESSION_COOKIE)?.value);
    if (home) redirect(home);
  }

  return (
    <SignInForm
      initialWorkspace={first(params.workspace) ?? store.get(WORKSPACE_HINT_COOKIE)?.value ?? ""}
      next={first(params.next)}
      reason={reason}
    />
  );
}
