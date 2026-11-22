"use client";

import { useId } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { CommentBox } from "@/components/production/comment-box";
import { CommentThread, type ThreadComment } from "@/components/production/comment-thread";
import { useMe } from "@/components/session/session-gate";
import type { PartnerJobComment, PartnerJobDetail } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { piecesText } from "@/lib/partner-jobs/labels";
import { partnerCommentAttachmentUrl, usePartnerComments, usePostPartnerComment } from "@/lib/partner-jobs/queries";

import { useWorkshop } from "./use-workshop";

const PANEL = "flex flex-col gap-2 rounded-[20px] bg-card px-5 py-4";

/** What the job pays, for how many pieces, and the day it's due. */
export function JobPayPanel({ job }: { job: PartnerJobDetail }) {
  const format = useFormat();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={PANEL}>
      <h2 id={headingId} className="text-base font-semibold">
        Pay
      </h2>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-semibold tracking-[-0.04em] tabular-nums">{format.money(job.cost, format.currency)}</span>
        <span className="text-sm text-ink-2">{`for ${piecesText(job.quantity)}`}</span>
      </p>
      {job.due_on && <p className="text-sm text-ink-2">{`Due ${format.day(job.due_on)}`}</p>}
    </section>
  );
}

/** A comment in the shared thread's words: staff's are the workspace's, unnamed; the workshop's own by name. */
function threadComment(comment: PartnerJobComment): ThreadComment {
  return {
    id: comment.id,
    author: comment.author.kind === "workspace" ? "Staff" : (comment.author.name ?? "Your workshop"),
    authorKind: null,
    about: null,
    readers: null,
    body: comment.body,
    attachments: comment.attachments.map((file) => ({ fileVersionId: file.file_version_id, name: file.name })),
    createdAt: comment.created_at,
  };
}

/**
 * The thread with staff on this job, as Order detail's Comments panel sits beside its lines. erp-api
 * refuses a post while the workshop is suspended, so the box goes then.
 */
export function JobCommentsPanel({ job }: { job: PartnerJobDetail }) {
  const { partnerId, suspended } = useWorkshop();
  const workspace = useMe().data?.workspace.name;
  const comments = usePartnerComments(partnerId, job.id);
  const post = usePostPartnerComment(partnerId, job.id);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={`${PANEL} gap-3`}>
      <h2 id={headingId} className="text-base font-semibold">
        Comments
      </h2>
      {comments.isPending ? (
        <div role="status" aria-label="Loading the comments" className="h-16 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />
      ) : comments.isError && comments.items.length === 0 ? (
        <LoadFailure error={comments.error} fallback="The comments couldn't be loaded." onRetry={() => void comments.refetch()} />
      ) : (
        <CommentThread
          items={comments.items.map(threadComment)}
          hasNextPage={comments.hasNextPage}
          isFetchingNextPage={comments.isFetchingNextPage}
          onMore={() => void comments.fetchNextPage()}
          attachmentUrl={(commentId, fileVersionId) => partnerCommentAttachmentUrl(partnerId, job.id, commentId, fileVersionId)}
        />
      )}
      {!suspended && (
        <CommentBox
          readers={workspace ? `Staff at ${workspace} will read this.` : "Staff will read this."}
          onPost={async (body) => {
            await post.mutateAsync(body);
          }}
        />
      )}
    </section>
  );
}
