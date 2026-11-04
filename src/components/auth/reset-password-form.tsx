"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { applyFieldErrors, isApiProblem } from "@/lib/api/problem";
import { takeFragmentToken } from "@/lib/auth/fragment-token";

import { UNKNOWN, noAnswer } from "./copy";
import { Field } from "./field";
import { FormMessage } from "./form-message";

// erp-api's password rule (`passwords.ts:20`).
const schema = z.object({
  password: z.string().min(12, "Use at least 12 characters.").max(128, "Use at most 128 characters."),
});
type Values = z.infer<typeof schema>;

const EXPIRED = "This link has expired or was already used. Ask for a new one.";

const noSubscribe = () => () => {};

export function ResetPasswordForm() {
  // The token is only in the browser's address bar, so the rest renders in the browser only.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[26px] font-semibold tracking-[-0.7px]">Set a new password</h1>
      {inBrowser && <WithToken />}
    </div>
  );
}

function WithToken() {
  // Taken on the first render, before any request. React keeps the first
  // result when Strict Mode calls the initialiser twice.
  const [token] = useState(takeFragmentToken);
  const [status, setStatus] = useState<"form" | "done" | "expired">(token ? "form" : "expired");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "" } });

  const onSubmit = async ({ password }: Values) => {
    if (inFlight.current || !token) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const { response, error: problem } = await api.POST("/auth/password-reset/confirm", {
        body: { token, password },
      });
      if (response.ok) {
        setStatus("done");
        return;
      }
      if (response.status !== 400) {
        setError(UNKNOWN);
      } else if (isApiProblem(problem) && problem.errors?.some((e) => e.path === "password")) {
        // erp-api answers 400 both for a rejected password and for a bad link.
        applyFieldErrors(problem, setFieldError, ["password"]);
      } else {
        setStatus("expired");
        return;
      }
    } catch {
      setError(noAnswer());
    }
    inFlight.current = false;
    setPending(false);
  };

  if (status === "done") {
    return (
      <>
        <FormMessage tone="info">Your password is set. Sign in with it now.</FormMessage>
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </>
    );
  }

  if (status === "expired") {
    return (
      <>
        <FormMessage tone="error">{EXPIRED}</FormMessage>
        <Button asChild variant="secondary">
          <Link href="/forgot-password">Ask for a new link</Link>
        </Button>
      </>
    );
  }

  return (
    <form onSubmit={(event) => handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
      {error && <FormMessage tone="error">{error}</FormMessage>}

      <fieldset disabled={pending} className="flex flex-col gap-4">
        <Field id="password" label="New password" hint="At least 12 characters." error={errors.password?.message}>
          {(props) => <Input {...props} {...register("password")} type="password" autoComplete="new-password" />}
        </Field>
        <Button type="submit" className="mt-1">
          {pending ? "Setting password…" : "Set password"}
        </Button>
      </fieldset>
    </form>
  );
}
