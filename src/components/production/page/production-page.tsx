"use client";

import { useState, type ReactNode } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { Board } from "@/components/production/board/board";
import { ByStep } from "@/components/production/by-step/by-step";
import { OpenPieceProvider } from "@/components/production/open-piece";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormat } from "@/lib/format/use-format";

import { useProductType } from "./product-type";

type View = "board" | "by-step";

const VIEWS: { value: View; name: string }[] = [
  { value: "board", name: "Board" },
  { value: "by-step", name: "By step" },
];

function Panel({ children }: { children: ReactNode }) {
  return <section className="flex flex-col rounded-[20px] bg-card">{children}</section>;
}

/**
 * Production as staff see it: the Board (the default) and By step, as tabs, with History to come. The product
 * type is the page's, so both tabs show the same one. React state only: a reload opens the Board on the busiest
 * type. What the person may do comes in as props (`staff-production/production-page.tsx`).
 */
export function Production({ canMove, canUpload }: { canMove: boolean; canUpload: boolean }) {
  const { date } = useFormat();
  const [today] = useState(() => new Date().toISOString());
  const [view, setView] = useState<View>("board");
  // What a pass sent as the Board closed came to; the Board can't say it any more.
  const [awayNotice, setAwayNotice] = useState<string | null>(null);
  const productType = useProductType();
  const tab = { canMove, canUpload, workflowId: productType.workflowId, onWorkflow: productType.setWorkflowId };

  let body: ReactNode;
  if (productType.isError) {
    body = (
      <Panel>
        <div className="px-4 py-3">
          <LoadFailure error={productType.error} fallback="Production couldn't be loaded." onRetry={productType.refetch} />
        </div>
      </Panel>
    );
  } else if (productType.empty) {
    body = (
      <Panel>
        <p className="px-4 py-14 text-center text-sm text-ink-2">No product types yet.</p>
      </Panel>
    );
  }

  return (
    <OpenPieceProvider>
      <Tabs
        value={view}
        onValueChange={(next) => {
          setAwayNotice(null);
          setView(next as View);
        }}
        className="gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
          <div className="flex items-center gap-3">
            <h1 className="text-title font-semibold">Production</h1>
            <p className="hidden text-sm text-ink-2 sm:block">{date(today)}</p>
          </div>
          <TabsList variant="line" aria-label="Production views" className="h-auto!">
            {VIEWS.map(({ value, name }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-11 flex-none px-3 text-ink-2 group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-ink"
              >
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Always there, so the first notice is read out; a row of its own under the title. */}
          <p role="status" className="basis-full text-caption font-medium text-ink">
            {awayNotice}
          </p>
        </div>
        {body ?? (
          <>
            <TabsContent value="board">
              <Board {...tab} onAwayNotice={setAwayNotice} />
            </TabsContent>
            <TabsContent value="by-step">
              <ByStep {...tab} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </OpenPieceProvider>
  );
}
