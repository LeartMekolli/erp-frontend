"use client";

import { FileText } from "lucide-react";
import { useState } from "react";

import { HistoryTab } from "@/components/production/history-tab";
import { OpenPieceProvider, useOpenPiece } from "@/components/production/open-piece";
import { PhotoLinksProvider } from "@/components/production/photo-links";
import { PiecesTab } from "@/components/production/pieces-tab";
import { QualityTab } from "@/components/production/quality-tab";
import { submitErrorText } from "@/components/production/submit-error";
import { TAB, TAB_ROW } from "@/components/production/tab-classes";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PartnerJobDetail } from "@/lib/api/schema-types";
import { openLink } from "@/lib/files/open-link";
import { partnerPhotoUrl, partnerSopUrl, usePartnerMoves, usePartnerMovePieces, type PartnerMovesFilter } from "@/lib/partner-jobs/queries";
import { partnerEntry, partnerProgress, partnerRules } from "@/lib/partner-jobs/shape";
import { failedOnLine } from "@/lib/production/quality";
import type { UploadTarget } from "@/lib/upload/upload";

import { PartnerPiecePanel, partnerSections, usePartnerSectionPieces } from "./partner-pieces";

const TABS = ["pieces", "quality", "history"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = { pieces: "Pieces", quality: "Quality", history: "History" };

/** The story of the piece open on this job, if any. */
function JobPiecePanel() {
  const piece = useOpenPiece();
  return <PartnerPiecePanel id={piece.id} onClose={piece.close} />;
}

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

/**
 * The main panel of a job the partner holds: Pieces, Quality and History. Each step shows once, as a
 * section of Pieces with its count and instructions. The tab is kept on the page, so a reload opens
 * Pieces. The open piece is kept on the page too, as on staff's order page, and starts closed on another job.
 */
export function JobTabs({ job, partnerId }: { job: PartnerJobDetail; partnerId: string }) {
  const [tab, setTab] = useState<Tab>("pieces");
  const failed = failedOnLine(job.steps);
  const choose = (value: string) => setTab(value as Tab);

  return (
    <OpenPieceProvider key={job.id}>
      <PhotoLinksProvider link={(photo) => partnerPhotoUrl(partnerId, job.id, photo)} mayView>
        <section aria-label="Work on this job" className="flex min-w-0 flex-col rounded-[20px] bg-card px-5 py-4">
          <Tabs value={tab} onValueChange={choose} activationMode="manual" className="min-w-0">
            <TabsList variant="line" aria-label="Pieces, quality and history" className={TAB_ROW}>
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
          </Tabs>
        </section>
        <JobPiecePanel />
      </PhotoLinksProvider>
    </OpenPieceProvider>
  );
}
