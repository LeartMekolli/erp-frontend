"use client";

import { useState } from "react";

import { ByStep } from "@/components/production/by-step/by-step";
import { OpenPieceProvider } from "@/components/production/open-piece";
import { useFormat } from "@/lib/format/use-format";

/**
 * Production as staff see it: the work on the floor, step by step. Board and History join it as tabs later;
 * By step is the default. What the person may do comes in as props (`staff-production/production-page.tsx`).
 */
export function Production({ canMove, canUpload }: { canMove: boolean; canUpload: boolean }) {
  const { date } = useFormat();
  const [today] = useState(() => new Date().toISOString());
  return (
    <OpenPieceProvider>
      <div className="flex items-center gap-3 pt-1">
        <h1 className="text-title font-semibold">Production</h1>
        <p className="hidden text-sm text-ink-2 sm:block">{date(today)}</p>
      </div>
      <ByStep canMove={canMove} canUpload={canUpload} />
    </OpenPieceProvider>
  );
}
