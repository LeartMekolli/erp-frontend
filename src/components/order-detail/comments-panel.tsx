"use client";

import { useState } from "react";

import { Field } from "@/components/auth/field";
import { CommentBox } from "@/components/production/comment-box";
import { CommentThread, type ThreadComment } from "@/components/production/comment-thread";
import { NativeSelect } from "@/components/ui/native-select";
import type { Order, OrderComment, OrderPart } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { commentAttachmentUrl, useOrderComments, usePostComment } from "@/lib/orders/comments";
import { partnerStatus } from "@/lib/orders/line-partner";

import { LoadFailure } from "./load-failure";
import { Panel } from "./payment-panel";

const KIND: Record<OrderComment["author"]["kind"], string> = { staff: "Staff", customer: "Customer", partner: "Partner" };

type AnyLine = Pick<OrderPart, "id" | "quantity" | "product" | "partner">;

/** Every line and assembly part a comment can be about, in page order. */
function linesOf(order: Order): AnyLine[] {
  return [...order.lines].sort((a, b) => a.position - b.position).flatMap((line) => [line, ...[...line.parts].sort((a, b) => a.position - b.position)]);
}

const lineTitle = (line: AnyLine) => `${line.quantity} × ${line.product.name}`;

/** A comment in the shared thread's words. A customer's or partner's own comment needs no word for who reads it. */
function threadComment(comment: OrderComment, lines: AnyLine[]): ThreadComment {
  const line = lines.find((candidate) => candidate.id === comment.line_id);
  const readers = comment.author.kind !== "staff" ? null : comment.partner ? `With ${comment.partner.name}` : "Staff only";
  return {
    id: comment.id,
    author: comment.author.name,
    authorKind: KIND[comment.author.kind],
    about: line ? lineTitle(line) : null,
    readers,
    body: comment.body,
    attachments: comment.attachments.map((file) => ({ fileVersionId: file.file_version_id, name: file.name })),
    createdAt: comment.created_at,
  };
}

/** Where a comment is posted decides who reads it: a partner reads only a line it has accepted (`orders/comments.service.ts:19`). */
function CommentForm({ order, lines, now }: { order: Order; lines: AnyLine[]; now: number }) {
  const post = usePostComment(order.id);
  const [lineId, setLineId] = useState("");
  const line = lines.find((candidate) => candidate.id === lineId);
  const status = partnerStatus(line?.partner ?? null, now);
  const readers = status.kind === "accepted" ? `${status.name} will read this.` : "Only staff will read this.";

  const onPost = async (body: string) => {
    await post.mutateAsync({ body, ...(lineId ? { line_id: lineId } : {}) });
    setLineId("");
  };

  return (
    <CommentBox readers={readers} onPost={onPost}>
      <Field id="comment-line" label="About">
        {(props) => (
          <NativeSelect {...props} value={lineId} onChange={(event) => setLineId(event.target.value)}>
            <option value="">The whole order</option>
            {lines.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {lineTitle(candidate)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
    </CommentBox>
  );
}

/** What staff and the partners have said on an order, oldest first. */
export function CommentsPanel({ order, now }: { order: Order; now: number }) {
  const mayWrite = useCan("order.write");
  const comments = useOrderComments(order.id);
  const lines = linesOf(order);

  return (
    <Panel title="Comments">
      {comments.isPending ? (
        <div role="status" aria-label="Loading the comments" className="h-16 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />
      ) : comments.isError && comments.items.length === 0 ? (
        <LoadFailure error={comments.error} fallback="The comments couldn't be loaded." onRetry={() => void comments.refetch()} />
      ) : (
        <CommentThread
          items={comments.items.map((comment) => threadComment(comment, lines))}
          hasNextPage={comments.hasNextPage}
          isFetchingNextPage={comments.isFetchingNextPage}
          onMore={() => void comments.fetchNextPage()}
          attachmentUrl={(commentId, fileVersionId) => commentAttachmentUrl(order.id, commentId, fileVersionId)}
        />
      )}
      {mayWrite && <CommentForm order={order} lines={lines} now={now} />}
    </Panel>
  );
}
