"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { submitErrorText } from "@/components/order-detail/submit-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors, isApiProblem } from "@/lib/api/problem";

// erp-api's limit (`orders/order-response.ts:348`).
const schema = z.object({
  body: z.string().trim().min(1, "Write something first.").max(5000, "Use at most 5,000 characters."),
});
type Values = z.infer<typeof schema>;

const READERS_ID = "comment-readers";

/**
 * Writes a comment. Comments can't be edited or deleted, so the box always
 * says who will read it. `onPost` throws erp-api's refusal, which lands on the
 * field or above the form. `children` sits under the text, for staff's "About".
 */
export function CommentBox({ readers, onPost, children }: { readers: string; onPost: (body: string) => Promise<void>; children?: ReactNode }) {
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { body: "" } });

  const onSubmit = async (values: Values) => {
    setMessage(null);
    setPosting(true);
    try {
      await onPost(values.body);
    } catch (error) {
      setMessage(isApiProblem(error) && error.status === 400 ? applyFieldErrors(error, setError, ["body"]) : submitErrorText(error));
      return;
    } finally {
      setPosting(false);
    }
    reset();
  };

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-3 border-t border-line pt-3">
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <fieldset disabled={posting} className="flex flex-col gap-3">
        <Field id="comment-body" label="Add a comment" error={errors.body?.message}>
          {(props) => (
            <Textarea
              {...props}
              aria-describedby={[props["aria-describedby"], READERS_ID].filter(Boolean).join(" ")}
              {...register("body")}
              maxLength={5000}
            />
          )}
        </Field>
        {children}
        <p id={READERS_ID} className="text-caption font-medium text-ink">
          {readers}
        </p>
        <Button type="submit" className="self-end">
          {posting ? "Posting…" : "Post comment"}
        </Button>
      </fieldset>
    </form>
  );
}
