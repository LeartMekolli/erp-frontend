import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ForgotPassword } from "@/components/auth/forgot-password-form";
import { WORKSPACE_HINT_COOKIE } from "@/lib/routes";

export const metadata: Metadata = { title: "Reset your password · AMI" };

/** Always plain `/forgot-password`: the workspace typed on Sign in comes in an arrival note. */
export default async function ForgotPasswordPage() {
  const store = await cookies();
  return <ForgotPassword lastWorkspace={store.get(WORKSPACE_HINT_COOKIE)?.value ?? ""} />;
}
