"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { openLink } from "@/lib/files/open-link";
import { useFormat } from "@/lib/format/use-format";

import { submitErrorText } from "./submit-error";

/** One comment as either area shows it: each area words its author, line and readers. */
export interface ThreadComment {
  id: string;
  author: string;
  /** The kind of author, for example "Staff"; null when the author's name says enough. */
  authorKind: string | null;
  /** The line it's on; null for the whole order or when there's no choice. */
  about: string | null;
  /** Who else reads it; null when there's nothing to add. */
  readers: string | null;
  body: string;
  attachments: { fileVersionId: string; name: string }[];
  createdAt: string;
}

function Comment({ comment, attachmentUrl }: { comment: ThreadComment; attachmentUrl: (commentId: string, fileVersionId: string) => Promise<string> }) {
  const { dateTime } = useFormat();
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <li className="flex flex-col gap-1 border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold break-words">{comment.author}</span>
        {comment.authorKind && <span className="text-caption text-ink-2">{comment.authorKind}</span>}
        <span className="ml-auto text-caption text-ink-2">{dateTime(comment.createdAt)}</span>
      </div>
      {(comment.about || comment.readers) && (
        <div className="flex flex-wrap gap-x-2 text-caption font-medium text-ink-2">
          {comment.about && <span className="break-words">{comment.about}</span>}
          {comment.readers && <span className="break-words">{comment.readers}</span>}
        </div>
      )}
      <p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>
      {comment.attachments.map((file) => (
        <button
          key={file.fileVersionId}
          type="button"
          className="min-h-11 self-start text-left text-sm break-all underline underline-offset-2 hover:text-ink"
          onClick={() => {
            setFailure(null);
            openLink(() => attachmentUrl(comment.id, file.fileVersionId)).catch((error: unknown) => setFailure(submitErrorText(error)));
          }}
        >
          {file.name}
        </button>
      ))}
      {failure && <p className="text-caption text-late">{failure}</p>}
    </li>
  );
}

/** A comment thread, oldest first, with a way to load newer ones. */
export function CommentThread({
  items,
  hasNextPage,
  isFetchingNextPage,
  onMore,
  attachmentUrl,
}: {
  items: ThreadComment[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onMore: () => void;
  attachmentUrl: (commentId: string, fileVersionId: string) => Promise<string>;
}) {
  return (
    <>
      {items.length === 0 ? (
        <p className="text-sm text-ink-2">No comments yet.</p>
      ) : (
        <ol aria-label="Comments" className="flex flex-col">
          {items.map((comment) => (
            <Comment key={comment.id} comment={comment} attachmentUrl={attachmentUrl} />
          ))}
        </ol>
      )}
      {hasNextPage && (
        <Button variant="link" className="self-start" disabled={isFetchingNextPage} onClick={onMore}>
          Show newer comments
        </Button>
      )}
    </>
  );
}
