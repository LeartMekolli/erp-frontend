import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignIn } from "@/components/auth/sign-in-form";
import { SIGNED_OUT_COOKIE } from "@/lib/auth/auth-note";
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

/** Always plain `/sign-in`: why, where back to and which workspace come in an arrival note (`SignIn`). */
export default async function SignInPage() {
  const store = await cookies();

  // One workspace per browser: someone signed in goes home. Not right after a
  // sign-out, whose session cookie may not be cleared yet.
  if (!store.has(SIGNED_OUT_COOKIE)) {
    const home = await signedInHome(store.get(SESSION_COOKIE)?.value);
    if (home) redirect(home);
  }

  return <SignIn lastWorkspace={store.get(WORKSPACE_HINT_COOKIE)?.value ?? ""} />;
}
