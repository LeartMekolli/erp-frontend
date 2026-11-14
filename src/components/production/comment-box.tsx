"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors, isApiProblem } from "@/lib/api/problem";

import { submitErrorText } from "./submit-error";

// erp-api's limit (`orders/order-response.ts:348`).
const schema = z.object({
  body: z.string().trim().min(1, "Write something first.").max(5000, "Use at most 5,000 characters."),
});
type Values = z.infer<typeof schema>;

/**
 * Writes a comment. Comments can't be edited or deleted, so the box always
 * says who will read it. `onPost` throws erp-api's refusal, which lands on the
 * field or above the form. `children` sits under the text, for staff's "About".
 * `alternative` is a second way to post the same text, beside the main button.
 */
export function CommentBox({
  readers,
  onPost,
  postLabel = "Post comment",
  alternative,
  children,
}: {
  readers: string;
  onPost: (body: string) => Promise<void>;
  postLabel?: string;
  alternative?: { label: string; onPost: (body: string) => Promise<void> };
  children?: ReactNode;
}) {
  const id = useId();
  const bodyId = `${id}-body`;
  const readersId = `${id}-readers`;
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { body: "" } });

  const submitWith = (post: (body: string) => Promise<void>) => async (values: Values) => {
    setMessage(null);
    setPosting(true);
    try {
      await post(values.body);
    } catch (error) {
      setMessage(isApiProblem(error) && error.status === 400 ? applyFieldErrors(error, setError, ["body"]) : submitErrorText(error));
      return;
    } finally {
      setPosting(false);
    }
    reset();
  };

  return (
    <form onSubmit={(event) => void handleSubmit(submitWith(onPost))(event)} noValidate className="flex flex-col gap-3 border-t border-line pt-3">
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <fieldset disabled={posting} className="flex flex-col gap-3">
        <Field id={bodyId} label="Add a comment" error={errors.body?.message}>
          {(props) => (
            <Textarea
              {...props}
              aria-describedby={[props["aria-describedby"], readersId].filter(Boolean).join(" ")}
              {...register("body")}
              maxLength={5000}
            />
          )}
        </Field>
        {children}
        <p id={readersId} aria-live="polite" className="text-caption font-medium text-ink">
          {readers}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {alternative && (
            <Button type="button" variant="secondary" onClick={() => void handleSubmit(submitWith(alternative.onPost))()}>
              {alternative.label}
            </Button>
          )}
          <Button type="submit">{posting ? "Posting…" : postLabel}</Button>
        </div>
      </fieldset>
    </form>
  );
}
