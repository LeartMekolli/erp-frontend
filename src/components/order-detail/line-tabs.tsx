"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OrderState } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { useGroup } from "@/lib/production/queries";
import { failedOnLine } from "@/lib/production/quality";

import { HistoryTab } from "./history-tab";
import { LoadFailure } from "./load-failure";
import { PiecesTab } from "./pieces-tab";
import { QualityTab } from "./quality-tab";
import { StepStrip } from "./step-strip";

/** How many of an order's lines load their progress without being asked. */
const LOADED_UP_FRONT = 5;

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
      <StepStrip group={group.data} />
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
          <PiecesTab group={group.data} orderState={orderState} partnerName={partnerName} />
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
