"use client";

import { FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { CommentBox } from "@/components/production/comment-box";
import { CommentThread, type ThreadComment } from "@/components/production/comment-thread";
import { HistoryTab } from "@/components/production/history-tab";
import { PhotoLinksProvider } from "@/components/production/photo-links";
import { PiecesTab } from "@/components/production/pieces-tab";
import { QualityTab } from "@/components/production/quality-tab";
import { StepStrip } from "@/components/production/step-strip";
import { submitErrorText } from "@/components/production/submit-error";
import { Button } from "@/components/ui/button";
import { TAB, TAB_ROW } from "@/components/production/tab-classes";
import { useMe } from "@/components/session/session-gate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PartnerJobComment, PartnerJobDetail } from "@/lib/api/schema-types";
import { openLink } from "@/lib/files/open-link";
import {
  partnerCommentAttachmentUrl,
  partnerPhotoUrl,
  partnerSopUrl,
  usePartnerComments,
  usePartnerMoves,
  usePartnerMovePieces,
  usePostPartnerComment,
  type PartnerMovesFilter,
} from "@/lib/partner-jobs/queries";
import { partnerEntry, partnerProgress, partnerRules, partnerStages } from "@/lib/partner-jobs/shape";
import { failedOnLine } from "@/lib/production/quality";
import type { UploadTarget } from "@/lib/upload/upload";

import { jobHref } from "./offer-actions";
import { PartnerPiecePanel, partnerSections, usePartnerSectionPieces } from "./partner-pieces";
import { useWorkshop } from "./use-workshop";

const TABS = ["pieces", "quality", "history", "comments"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = { pieces: "Pieces", quality: "Quality", history: "History", comments: "Comments" };

const isTab = (value: string | null): value is Tab => (TABS as readonly (string | null)[]).includes(value);

/** The partner's rules never load apart from the job: they come with it. */
const LOADED = { isPending: false, error: null, refetch: () => undefined };

function JobPieces({ job, partnerId }: { job: PartnerJobDetail; partnerId: string }) {
  const rules = partnerRules(job);
  const move = usePartnerMovePieces(partnerId);
  const photos: UploadTarget = { area: "partner", partnerId };
  return (
    <PiecesTab
      groupId={job.id}
      sections={partnerSections(job)}
      useSectionPieces={usePartnerSectionPieces}
      rules={(stepKey) => rules.find((rule) => rule.key === stepKey)}
      rulesError={false}
      path={job.steps}
      next={() => "unknown"}
      selectable
      mayUpload
      uploadTarget={photos}
      blockedReason={null}
      countsFor={null}
      onMove={async (body) => {
        await move.mutateAsync(body);
      }}
      stepInstructions={(stepKey) => {
        const step = job.steps.find((one) => one.key === stepKey);
        return step?.sop_file_version_id ? <StepInstructions partnerId={partnerId} jobId={job.id} step={step} /> : null;
      }}
      focusAfterMove
      lostLook
    />
  );
}

/** Opens a step's instructions in a new tab; says so where it is when the link can't be had. */
function StepInstructions({ partnerId, jobId, step }: { partnerId: string; jobId: string; step: { key: string; name: string } }) {
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <Button
        variant="link"
        aria-label={`Instructions for ${step.name}`}
        onClick={() => {
          setFailure(null);
          openLink(() => partnerSopUrl(partnerId, jobId, step.key)).catch((error: unknown) => setFailure(submitErrorText(error)));
        }}
      >
        <FileText aria-hidden />
        Instructions
      </Button>
      {failure && <span className="text-caption text-late">{failure}</span>}
    </span>
  );
}

function JobHistory({ job, partnerId }: { job: PartnerJobDetail; partnerId: string }) {
  const [filter, setFilter] = useState<PartnerMovesFilter>("all");
  const moves = usePartnerMoves(partnerId, job.id, filter);
  return (
    <HistoryTab
      list={{ ...moves, items: moves.items.map(partnerEntry) }}
      counts={moves.counts}
      filter={filter}
      onFilter={setFilter}
      rules={{ data: partnerRules(job), ...LOADED }}
      cameAt={moves.handedOverAt}
      of="job"
    />
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

/** The thread with staff on this job. erp-api refuses a post while the workshop is suspended, so the box goes then. */
function JobComments({ job, partnerId }: { job: PartnerJobDetail; partnerId: string }) {
  const { suspended } = useWorkshop();
  const workspace = useMe().data?.workspace.name;
  const comments = usePartnerComments(partnerId, job.id);
  const post = usePostPartnerComment(partnerId, job.id);

  return (
    <div className="flex flex-col gap-3 pt-3">
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
    </div>
  );
}

/**
 * A job the partner holds: where its pieces are, then its Pieces, Quality, History and Comments. The tab is
 * in the address (`?tab=history`); Pieces has no parameter. So is the open piece (`?piece=<id>`), as on
 * staff's order page.
 */
export function JobTabs({ job, partnerId }: { job: PartnerJobDetail; partnerId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const asked = search.get("tab");
  const tab: Tab = isTab(asked) ? asked : "pieces";
  const failed = failedOnLine(job.steps);
  const page = jobHref(partnerId, job.id);

  const choose = (value: string) => {
    router.replace(value === "pieces" ? page : `${page}?tab=${value}`, { scroll: false });
  };

  return (
    <PhotoLinksProvider link={(photo) => partnerPhotoUrl(partnerId, job.id, photo)} mayView>
      <section aria-label="Work on this job" className="flex flex-col rounded-[20px] bg-card px-4 py-4 sm:px-6">
        <StepStrip stages={partnerStages(job)} />
        <Tabs value={tab} onValueChange={choose} activationMode="manual" className="min-w-0 pt-2">
          {/* Four tabs and the failed count don't fit 320 px: the row scrolls sideways. */}
          <TabsList variant="line" aria-label="Pieces, quality, history and comments" className={TAB_ROW}>
            {TABS.map((value) => (
              <TabsTrigger key={value} value={value} className={TAB}>
                {TAB_LABEL[value]}
                {value === "quality" && failed > 0 && (
                  <>
                    {" "}
                    <span className="rounded-full bg-collect/20 px-1.5 text-caption font-medium text-ink tabular-nums">{`${failed} failed`}</span>
                  </>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="pieces">
            <JobPieces job={job} partnerId={partnerId} />
          </TabsContent>
          <TabsContent value="quality">
            <QualityTab progress={partnerProgress(job)} rules={partnerRules(job)} rulesState={LOADED} of="job" />
          </TabsContent>
          <TabsContent value="history">
            <JobHistory job={job} partnerId={partnerId} />
          </TabsContent>
          <TabsContent value="comments">
            <JobComments job={job} partnerId={partnerId} />
          </TabsContent>
        </Tabs>
      </section>
      <PartnerPiecePanel id={search.get("piece")} onClose={() => router.replace(page, { scroll: false })} />
    </PhotoLinksProvider>
  );
}
