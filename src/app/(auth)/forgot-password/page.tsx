import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { AUTH_NOTE_COOKIE, parseAuthNote } from "@/lib/auth/auth-note";
import { WORKSPACE_HINT_COOKIE } from "@/lib/routes";

export const metadata: Metadata = { title: "Reset your password · AMI" };

/** Always plain `/forgot-password`: the workspace typed on sign-in comes in the auth note. */
export default async function ForgotPasswordPage() {
  const store = await cookies();
  const { workspace } = parseAuthNote(store.get(AUTH_NOTE_COOKIE)?.value);

  return <ForgotPasswordForm initialWorkspace={workspace ?? store.get(WORKSPACE_HINT_COOKIE)?.value ?? ""} />;
}
