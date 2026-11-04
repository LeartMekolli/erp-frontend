"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyFieldErrors } from "@/lib/api/problem";
import {
  acceptInvitation,
  previewInvitation,
  type AcceptInput,
  type InvitationPreview,
} from "@/lib/auth/invitation";

import { UNKNOWN, noAnswer } from "./copy";
import { Field } from "./field";
import { FormMessage } from "./form-message";
import { WithLinkToken } from "./link-token";

// erp-api's rules (`auth.controller.ts`, `passwords.ts:20`).
const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(200, "Use at most 200 characters."),
  password: z.string().min(12, "Use at least 12 characters.").max(128, "Use at most 128 characters."),
});
type Values = z.infer<typeof schema>;

const INVALID = "This invitation has expired or was already used. Ask whoever invited you to send a new one.";
const CUSTOMER = "This invitation is for ordering. Use your supplier's customer site to accept it.";
const TAKEN = "This invitation can't be used with this email. Ask whoever invited you.";
const JOINED = "You're in. Sign in to get started.";

export function AcceptInvitationForm() {
  return <WithLinkToken>{(token) => (token ? <Invitation token={token} /> : <Invalid />)}</WithLinkToken>;
}

function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-title font-semibold">{title}</h1>
      {children}
    </div>
  );
}

function SignInLink() {
  return (
    <Button asChild>
      <Link href="/sign-in">Sign in</Link>
    </Button>
  );
}

function Invalid() {
  return (
    <Layout title="Accept your invitation">
      <FormMessage tone="error">{INVALID}</FormMessage>
    </Layout>
  );
}

type Preview =
  | { state: "loading" }
  | { state: "ready"; preview: InvitationPreview | null }
  | { state: "unreachable"; message: string };

/** Asks erp-api what the link is, then shows what fits it. */
function Invitation({ token }: { token: string }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Preview>({ state: "loading" });

  useEffect(() => {
    let live = true;
    previewInvitation(token).then(
      (preview) => {
        if (live) setLoaded({ state: "ready", preview });
      },
      () => {
        if (live) setLoaded({ state: "unreachable", message: noAnswer() });
      },
    );
    return () => {
      live = false;
    };
  }, [token, attempt]);

  if (loaded.state === "loading") {
    return (
      <Layout title="Accept your invitation">
        <p role="status" className="text-sm text-ink-2">
          Checking your invitation…
        </p>
      </Layout>
    );
  }

  if (loaded.state === "unreachable") {
    return (
      <Layout title="Accept your invitation">
        <FormMessage tone="error">{loaded.message}</FormMessage>
        <Button
          variant="secondary"
          onClick={() => {
            setLoaded({ state: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </Layout>
    );
  }

  const { preview } = loaded;
  if (!preview || preview.status !== "pending") return <Invalid />;

  if (preview.kind === "customer") {
    return (
      <Layout title="Accept your invitation">
        <FormMessage tone="error">{CUSTOMER}</FormMessage>
      </Layout>
    );
  }

  // erp-api refuses a staff invitation to an existing account (409).
  if (preview.kind === "staff" && preview.has_account) {
    return (
      <Layout title="Accept your invitation">
        <FormMessage tone="error">
          {preview.email} already has an account in {preview.workspace.name}. Sign in with it instead.
        </FormMessage>
        <SignInLink />
      </Layout>
    );
  }

  return <Join token={token} kind={preview.kind} preview={preview} />;
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function Join({ token, kind, preview }: { token: string; kind: "staff" | "partner"; preview: InvitationPreview }) {
  // A partner person with an account joins with the token alone.
  const needsAccount = !preview.has_account;
  const [status, setStatus] = useState<"form" | "joined" | "invalid">("form");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", password: "" } });

  const join = async (values: Values | null) => {
    if (inFlight.current) return;
    let input: AcceptInput;
    if (kind === "staff") {
      if (!values) return;
      input = { kind, token, ...values };
    } else {
      input = { kind, token, ...values };
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await acceptInvitation(input);
      if (result === "accepted" || result === "invalid") {
        setStatus(result === "accepted" ? "joined" : "invalid");
        return;
      }
      if (result === "taken") setError(TAKEN);
      else if (result.problem.errors?.length) {
        const rest = applyFieldErrors(result.problem, setFieldError, ["name", "password"]);
        if (rest) setError(rest);
      } else setError(UNKNOWN);
    } catch {
      setError(noAnswer());
    }
    inFlight.current = false;
    setPending(false);
  };

  if (status === "invalid") return <Invalid />;

  const title = `Join ${preview.workspace.name}`;
  if (status === "joined") {
    return (
      <Layout title={title}>
        <FormMessage tone="info">{JOINED}</FormMessage>
        <SignInLink />
      </Layout>
    );
  }

  const role = kind === "partner" ? capitalise(preview.role) : preview.role;
  const greeting = preview.organisation
    ? `You're invited to work for ${preview.organisation.name} as ${role}, with ${preview.email}.`
    : `You're invited as ${role}, with ${preview.email}.`;

  return (
    <Layout title={title}>
      <p className="text-sm text-ink-2">{greeting}</p>

      <form
        onSubmit={(event) => {
          if (needsAccount) return handleSubmit(join)(event);
          event.preventDefault();
          return join(null);
        }}
        noValidate
        className="flex flex-col gap-5"
      >
        {error && <FormMessage tone="error">{error}</FormMessage>}

        <fieldset disabled={pending} className="flex flex-col gap-4">
          {needsAccount ? (
            <>
              <Field id="name" label="Your name" error={errors.name?.message}>
                {(props) => <Input {...props} {...register("name")} autoComplete="name" />}
              </Field>
              <Field id="password" label="Password" hint="At least 12 characters." error={errors.password?.message}>
                {(props) => <Input {...props} {...register("password")} type="password" autoComplete="new-password" />}
              </Field>
            </>
          ) : (
            <p className="text-sm text-ink-2">You already use AMI, so your password stays the same.</p>
          )}
          <Button type="submit" className="mt-1">
            {pending ? "Joining…" : "Join"}
          </Button>
        </fieldset>
      </form>
    </Layout>
  );
}
