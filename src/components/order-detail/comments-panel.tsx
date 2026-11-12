"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors, isApiProblem } from "@/lib/api/problem";
import type { Order, OrderComment, OrderPart } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { openLink } from "@/lib/files/download";
import { useFormat } from "@/lib/format/use-format";
import { commentAttachmentUrl, useOrderComments, usePostComment } from "@/lib/orders/comments";

import { LoadFailure } from "./load-failure";
import { Panel } from "./payment-panel";
import { submitErrorText } from "./submit-error";

const KIND: Record<OrderComment["author"]["kind"], string> = { staff: "Staff", customer: "Customer", partner: "Partner" };

/** Who else reads a staff comment. A customer's or partner's own comment needs no word for it. */
const READERS: Record<OrderComment["visibility"], string> = { staff: "Staff only", customer: "To the customer", partner: "To the partner" };

// erp-api's limit (`orders/order-response.ts:346`).
const schema = z.object({
  body: z.string().trim().min(1, "Write something first.").max(5000, "Use at most 5,000 characters."),
  lineId: z.string(),
  reader: z.enum(["staff", "customer", "partner"]),
});
type Values = z.infer<typeof schema>;

type AnyLine = Pick<OrderPart, "id" | "quantity" | "product" | "partner">;

/** Every line and assembly part a comment can be about, in page order. */
function linesOf(order: Order): AnyLine[] {
  return [...order.lines].sort((a, b) => a.position - b.position).flatMap((line) => [line, ...[...line.parts].sort((a, b) => a.position - b.position)]);
}

const lineTitle = (line: AnyLine) => `${line.quantity} × ${line.product.name}`;

function Comment({ comment, order, lines }: { comment: OrderComment; order: Order; lines: AnyLine[] }) {
  const { dateTime } = useFormat();
  const [failure, setFailure] = useState<string | null>(null);
  const line = lines.find((candidate) => candidate.id === comment.line_id);
  const readers = comment.author.kind === "staff" ? READERS[comment.visibility] : null;

  return (
    <li className="flex flex-col gap-1 border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold break-words">{comment.author.name}</span>
        <span className="text-caption text-ink-2">{KIND[comment.author.kind]}</span>
        <span className="ml-auto text-caption text-ink-2">{dateTime(comment.created_at)}</span>
      </div>
      {(line || readers) && (
        <div className="flex flex-wrap gap-x-2 text-caption font-medium text-ink-2">
          {line && <span className="break-words">{lineTitle(line)}</span>}
          {readers && <span>{readers}</span>}
        </div>
      )}
      <p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>
      {comment.attachments.map((file) => (
        <button
          key={file.file_version_id}
          type="button"
          className="min-h-11 self-start text-left text-sm break-all underline underline-offset-2 hover:text-ink"
          onClick={() => {
            setFailure(null);
            openLink(() => commentAttachmentUrl(order.id, comment.id, file.file_version_id)).catch((error: unknown) => setFailure(submitErrorText(error)));
          }}
        >
          {file.name}
        </button>
      ))}
      {failure && <p className="text-caption text-late">{failure}</p>}
    </li>
  );
}

function CommentForm({ order, lines }: { order: Order; lines: AnyLine[] }) {
  const post = usePostComment(order.id);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { body: "", lineId: "", reader: "staff" } });
  const [lineId, reader] = useWatch({ control, name: ["lineId", "reader"] });
  const line = lines.find((candidate) => candidate.id === lineId);
  // A partner reads only what's on a job it has accepted (`partnerScope` in erp-api's `orders/comments.service.ts`).
  const holder = line?.partner?.status === "accepted" ? line.partner : null;

  const onSubmit = async (values: Values) => {
    setMessage(null);
    try {
      await post.mutateAsync({ body: values.body, ...(values.lineId ? { line_id: values.lineId } : {}), visibility: values.reader });
    } catch (error) {
      setMessage(isApiProblem(error) && error.status === 400 ? applyFieldErrors(error, setError, ["body"]) : submitErrorText(error));
      return;
    }
    reset();
  };

  const notice =
    reader === "partner" && holder ? `${holder.name} will read this, not the customer` : reader === "customer" ? "The customer will read this" : "Only staff will read this";

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-3 border-t border-line pt-3">
      {message && <FormMessage tone="error">{message}</FormMessage>}
      <fieldset disabled={post.isPending} className="flex flex-col gap-3">
        <Field id="comment-body" label="Add a comment" error={errors.body?.message}>
          {(props) => <Textarea {...props} {...register("body")} maxLength={5000} />}
        </Field>
        <Field id="comment-line" label="About">
          {(props) => (
            <NativeSelect
              {...props}
              {...register("lineId", {
                // The partner is offered only on its own line, so another line falls back to staff only.
                onChange: () => {
                  if (getValues("reader") === "partner") setValue("reader", "staff");
                },
              })}
            >
              <option value="">The whole order</option>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {lineTitle(line)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field id="comment-reader" label="Who reads it">
          {(props) => (
            <NativeSelect {...props} {...register("reader")}>
              <option value="staff">Staff only</option>
              <option value="customer">The customer</option>
              {holder && <option value="partner">{holder.name}</option>}
            </NativeSelect>
          )}
        </Field>
        <p className="text-caption font-medium text-ink">{notice}</p>
        <Button type="submit" className="self-end">
          {post.isPending ? "Posting…" : "Post comment"}
        </Button>
      </fieldset>
    </form>
  );
}

/** What staff, the customer and the partner have said on an order, oldest first. */
export function CommentsPanel({ order }: { order: Order }) {
  const mayWrite = useCan("order.write");
  const comments = useOrderComments(order.id);
  const lines = linesOf(order);

  return (
    <Panel title="Comments">
      {comments.isPending ? (
        <div role="status" aria-label="Loading the comments" className="h-16 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />
      ) : comments.isError && comments.items.length === 0 ? (
        <LoadFailure error={comments.error} fallback="The comments couldn't be loaded." onRetry={() => void comments.refetch()} />
      ) : comments.items.length === 0 ? (
        <p className="text-sm text-ink-2">No comments yet.</p>
      ) : (
        <ol aria-label="Comments" className="flex flex-col">
          {comments.items.map((comment) => (
            <Comment key={comment.id} comment={comment} order={order} lines={lines} />
          ))}
        </ol>
      )}
      {comments.hasNextPage && (
        <Button variant="link" className="self-start" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
          Show newer comments
        </Button>
      )}
      {mayWrite && <CommentForm order={order} lines={lines} />}
    </Panel>
  );
}
