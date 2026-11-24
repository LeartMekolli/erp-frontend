"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearSignedOut } from "@/lib/auth/auth-note";
import { safeNext } from "@/lib/auth/safe-next";
import { leaveArrivalNote, useArrivalNote, type ArrivalNote } from "@/lib/navigation/arrival-note";
import { clientSession } from "@/lib/session/client-session";

import { OFFLINE, UNKNOWN, UNREACHABLE } from "./copy";
import { Field } from "./field";
import { FormMessage } from "./form-message";

const schema = z.object({
  workspace: z.string().trim().min(1, "Enter your workspace."),
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

const ERRORS: Record<string, string> = {
  invalid_credentials: "That workspace, email and password don't match. Check them and try again.",
  too_many_attempts: "Too many attempts. Try again in 15 minutes.",
  customer: "This account is for ordering. Use your supplier's customer site to sign in.",
  no_access: "Your account has no access yet. Ask your workspace admin.",
  api_unreachable: UNREACHABLE,
};

const REASONS: Record<string, string> = {
  idle: "You were signed out after 3 hours without activity.",
  expired: "You were signed out because your session reached 12 hours. Sign in again to continue.",
  revoked: "Your session ended. Sign in again to continue.",
  "signed-out": "You've signed out.",
};

/**
 * `/sign-in`, always at its plain address. Why this tab was signed out, the page to go back to and the
 * workspace come in an arrival note, left by the tab that moved here, so each tab keeps its own and a
 * reload starts clean. Without one, the workspace is the last one this browser used.
 */
export function SignIn({ lastWorkspace }: { lastWorkspace: string }) {
  const [note, setNote] = useState<ArrivalNote>({});
  useArrivalNote("/sign-in", setNote);
  // Keyed, so a note that arrives after the form is up fills the workspace in too.
  return (
    <SignInForm
      key={note.workspace ?? ""}
      initialWorkspace={note.workspace ?? lastWorkspace}
      next={note.next ?? null}
      reason={note.reason ?? null}
    />
  );
}

export function SignInForm({
  initialWorkspace,
  next,
  reason,
}: {
  initialWorkspace: string;
  next: string | null;
  reason: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { workspace: initialWorkspace, email: "", password: "" },
  });
  const workspace = useWatch({ control, name: "workspace" }).trim();

  const onSubmit = async (values: Values) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      const response = await fetch(new URL("/session/login", window.location.origin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        clientSession().startSession({
          accessToken: body.accessToken,
          expiresAt: body.expiresAt,
          signedInAt: body.signedInAt,
        });
        // Signed in again: the sign-in page may send this browser home once more.
        clearSignedOut();
        // Stays locked: the page is about to change.
        router.push(safeNext(next, body.destination.path));
        return;
      }
      setError(ERRORS[body.error] ?? UNKNOWN);
    } catch {
      setError(OFFLINE);
    }
    inFlight.current = false;
    setPending(false);
  };

  const notice = reason ? REASONS[reason] : undefined;

  return (
    <form onSubmit={(event) => handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
      <h1 className="text-title font-semibold">Sign in</h1>

      {error ? <FormMessage tone="error">{error}</FormMessage> : notice && <FormMessage tone="info">{notice}</FormMessage>}

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
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          after={
            <Link
              href="/forgot-password"
              onClick={() => {
                if (workspace) leaveArrivalNote("/forgot-password", { workspace });
              }}
              className="inline-flex min-h-11 items-center self-end text-caption font-medium underline underline-offset-[3px]"
            >
              Forgot password?
            </Link>
          }
        >
          {(props) => <Input {...props} {...register("password")} type="password" autoComplete="current-password" />}
        </Field>
        <Button type="submit" className="mt-1">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </fieldset>
    </form>
  );
}
