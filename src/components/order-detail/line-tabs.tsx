"use client";

import { useState } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { PiecesTab, type PieceSection } from "@/components/production/pieces-tab";
import { StepStrip, type Stage } from "@/components/production/step-strip";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Group, MoveBody, OrderState } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { useGroup, useMovePieces, useWorkflowVersion } from "@/lib/production/queries";
import { failedOnLine } from "@/lib/production/quality";
import { nextStepName } from "@/lib/production/selection";
import { staffRules } from "@/lib/production/staff";
import type { UploadTarget } from "@/lib/upload/upload";

import { HistoryTab } from "./history-tab";
import { QualityTab } from "./quality-tab";
import { useStaffSectionPieces } from "./staff-pieces";

/** How many of an order's lines load their progress without being asked. */
const LOADED_UP_FRONT = 5;

/** Once an order has left the building, or been called off, its pieces stay where they are. */
const NOT_MOVABLE: OrderState[] = ["shipped", "delivered", "cancelled"];

/** erp-api's refusal for an order whose production hasn't started (`orders/payment-hold.ts:7`). */
const WAITING_FOR_PAYMENT = "The order is waiting for payment";

const PHOTOS: UploadTarget = { area: "staff", kind: "image" };

const OFF_PATH = [
  { status: "finished", name: "Finished" },
  { status: "scrapped", name: "Scrapped" },
] as const;

/** Every step of the line's path, then finished and scrapped. */
function stagesOf(group: Group): Stage[] {
  return [
    ...group.steps.map((step) => ({ key: step.key, name: step.name, count: step.count, inRework: step.in_rework })),
    ...OFF_PATH.map(({ status, name }) => ({ key: `status:${status}`, name, count: group.pieces[status], inRework: 0 })),
  ];
}

/** The steps holding pieces, in path order, then finished and scrapped. */
function sectionsOf(group: Group): PieceSection[] {
  const steps = group.steps
    .filter((step) => step.count > 0)
    .map((step): PieceSection => ({ id: step.key, name: step.name, count: step.count, inRework: step.in_rework, stepKey: step.key, status: "active" }));
  const off = OFF_PATH.filter(({ status }) => group.pieces[status] > 0).map(
    ({ status, name }): PieceSection => ({ id: `status:${status}`, name, count: group.pieces[status], inRework: 0, stepKey: null, status }),
  );
  return [...steps, ...off];
}

/** Staff's Pieces tab: the line's pieces from `/workflow/...`, moved with staff's permissions. */
function StaffPieces({ group, orderState, partnerName }: { group: Group; orderState: OrderState; partnerName: string | null }) {
  const mayMove = useCan("workflow.move");
  const mayUpload = useCan("file.write");
  const version = useWorkflowVersion(group.workflow.id, group.workflow.version);
  // Read here, not only inside `rules`: TanStack Query re-renders for what render reads.
  const configured = version.data?.steps;
  const move = useMovePieces();

  return (
    <PiecesTab
      groupId={group.id}
      sections={sectionsOf(group)}
      useSectionPieces={useStaffSectionPieces}
      rules={(stepKey) => {
        const step = configured?.find((candidate) => candidate.key === stepKey);
        return step ? staffRules(step, group.steps) : undefined;
      }}
      rulesError={version.isError}
      path={group.steps}
      next={(stepKey) => {
        const name = nextStepName(group.steps, stepKey);
        return name ? { name } : null;
      }}
      selectable={mayMove && !NOT_MOVABLE.includes(orderState)}
      mayUpload={mayUpload}
      uploadTarget={PHOTOS}
      blockedReason={orderState === "awaiting_payment" ? WAITING_FOR_PAYMENT : null}
      countsFor={partnerName}
      onMove={async (body: MoveBody) => {
        await move.mutateAsync(body);
      }}
    />
  );
}

interface LineTabsProps {
  groupId: string;
  index: number;
  orderState: OrderState;
  /** The partner who has accepted this line, whose steps count for them. */
  partnerName?: string | null;
}

function Progress({ groupId, index, orderState, partnerName = null }: LineTabsProps) {
  const [asked, setAsked] = useState(false);
  const enabled = index < LOADED_UP_FRONT || asked;
  const group = useGroup(groupId, enabled);

  if (!enabled) {
    return (
      <Button variant="link" className="self-start" onClick={() => setAsked(true)}>
        Show progress
      </Button>
    );
  }
  if (group.isPending) {
    return <div role="status" aria-label="Loading this line's progress" className="mt-2 h-16 animate-pulse rounded-lg bg-panel-soft motion-reduce:animate-none" />;
  }
  if (!group.data) {
    return <LoadFailure error={group.error} fallback="This line's progress couldn't be loaded." onRetry={() => void group.refetch()} />;
  }

  const failed = failedOnLine(group.data.steps);
  return (
    <>
      <StepStrip stages={stagesOf(group.data)} />
      <Tabs defaultValue="pieces" className="min-w-0 pt-2">
        <TabsList variant="line" aria-label="Pieces, quality and history">
          <TabsTrigger value="pieces">Pieces</TabsTrigger>
          <TabsTrigger value="quality">
            Quality
            {failed > 0 && (
              <>
                {" "}
                <span className="rounded-full bg-collect/20 px-1.5 text-caption font-medium text-ink tabular-nums">{`${failed} failed`}</span>
              </>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="pieces">
          <StaffPieces group={group.data} orderState={orderState} partnerName={partnerName} />
        </TabsContent>
        <TabsContent value="quality">
          <QualityTab group={group.data} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab group={group.data} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** A line's step strip and its Pieces, Quality and History tabs, for those who may read work lists. */
export function LineTabs(props: LineTabsProps) {
  const mayRead = useCan("workflow.read");
  if (!mayRead) return null;
  return <Progress {...props} />;
}
