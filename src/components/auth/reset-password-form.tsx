"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { applyFieldErrors, isApiProblem } from "@/lib/api/problem";

import { UNKNOWN, noAnswer } from "./copy";
import { Field } from "./field";
import { FormMessage } from "./form-message";
import { WithLinkToken } from "./link-token";

// erp-api's password rule (`passwords.ts:20`).
const schema = z.object({
  password: z.string().min(12, "Use at least 12 characters.").max(128, "Use at most 128 characters."),
});
type Values = z.infer<typeof schema>;

const EXPIRED = "This link has expired or was already used. Ask for a new one.";

export function ResetPasswordForm() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-title font-semibold">Set a new password</h1>
      <WithLinkToken>{(token) => <ResetSteps token={token} />}</WithLinkToken>
    </div>
  );
}

function ResetSteps({ token }: { token: string | null }) {
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
