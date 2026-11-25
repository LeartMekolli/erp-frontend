"use client";

import { notFound } from "next/navigation";
import { useState } from "react";

import { ByStep } from "@/components/production/by-step/by-step";
import { OpenPieceProvider } from "@/components/production/open-piece";
import { useMe } from "@/components/session/session-gate";
import { can } from "@/lib/auth/permissions";
import { useFormat } from "@/lib/format/use-format";

/** `/production`: the work on the floor, step by step. Board and History join it as tabs later; By step is the default. */
export function ProductionPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "workflow.read")) notFound();
  return <Production canMove={can(me, "workflow.move")} />;
}

function Production({ canMove }: { canMove: boolean }) {
  const { date } = useFormat();
  const [today] = useState(() => new Date().toISOString());
  return (
    <OpenPieceProvider>
      <div className="flex items-center gap-3 pt-1">
        <h1 className="text-title font-semibold">Production</h1>
        <p className="hidden text-sm text-ink-2 sm:block">{date(today)}</p>
      </div>
      <ByStep canMove={canMove} />
    </OpenPieceProvider>
  );
}
