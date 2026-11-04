import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { WORKSPACE_HINT_COOKIE } from "@/lib/routes";

export const metadata: Metadata = { title: "Reset your password · AMI" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { workspace } = await searchParams;
  const store = await cookies();

  return (
    <ForgotPasswordForm
      initialWorkspace={(Array.isArray(workspace) ? workspace[0] : workspace) ?? store.get(WORKSPACE_HINT_COOKIE)?.value ?? ""}
    />
  );
}
