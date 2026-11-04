"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";

import { UNKNOWN, noAnswer } from "./copy";
import { Field } from "./field";
import { FormMessage } from "./form-message";

const schema = z.object({
  workspace: z.string().trim().min(1, "Enter your workspace.").max(63, "Use at most 63 characters."),
  email: z.string().trim().min(1, "Enter your email.").max(320, "Use at most 320 characters."),
});
type Values = z.infer<typeof schema>;

const SENT = "If that email has an account in this workspace, a reset link is on its way.";
// erp-api's reset limits count over an hour (`password-reset.service.ts`), not sign-in's 15 minutes.
const TOO_MANY = "Too many attempts. Try again in an hour.";

function BackToSignIn() {
  return (
    <Button asChild variant="link" className="self-start">
      <Link href="/sign-in">Back to sign in</Link>
    </Button>
  );
}

export function ForgotPasswordForm({ initialWorkspace }: { initialWorkspace: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { workspace: initialWorkspace, email: "" },
  });

  const onSubmit = async (values: Values) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      // Always 202, whether or not the email has an account.
      const { response } = await api.POST("/auth/password-reset", { body: values });
      if (response.ok) {
        setSent(true);
        return;
      }
      setError(response.status === 429 ? TOO_MANY : UNKNOWN);
    } catch {
      setError(noAnswer());
    }
    inFlight.current = false;
    setPending(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-title font-semibold">Reset your password</h1>

      {sent ? (
        <FormMessage tone="info">{SENT}</FormMessage>
      ) : (
        <form onSubmit={(event) => handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
          <p className="text-sm text-ink-2">Enter your workspace and email, and we&apos;ll send you a link to set a new password.</p>

          {error && <FormMessage tone="error">{error}</FormMessage>}

          <fieldset disabled={pending} className="flex flex-col gap-4">
            <Field id="workspace" label="Workspace" error={errors.workspace?.message}>
              {(props) => (
                <Input
                  {...props}
                  {...register("workspace")}
                  placeholder="your-workspace"
                  autoComplete="organization"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              )}
            </Field>
            <Field id="email" label="Email" error={errors.email?.message}>
              {(props) => (
                <Input {...props} {...register("email")} type="email" placeholder="you@company.com" autoComplete="username" />
              )}
            </Field>
            <Button type="submit" className="mt-1">
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </fieldset>
        </form>
      )}

      <BackToSignIn />
    </div>
  );
}
