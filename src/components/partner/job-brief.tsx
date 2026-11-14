"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "cn";

import type { PartnerJobDetail } from "@/lib/api/schema-types";

type Summary = NonNullable<PartnerJobDetail["summary"]>;

function Section({ title, items }: { title: string; items: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="list-disc pl-5 text-sm text-ink">
        {items.map((item) => (
          <li key={item} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The AI's brief for the job: what to make, what to watch out for, what it recommends and about how long it
 * takes. While erp-api writes it the page asks again; a failed or missing brief shows nothing.
 */
export function JobBrief({ summary }: { summary: PartnerJobDetail["summary"] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (summary === null || summary.status === "failed") return null;
  if (summary.status === "pending") {
    return (
      <p role="status" className="inline-flex items-center gap-1.5 text-sm text-ink-2">
        <Sparkles aria-hidden className="size-4 shrink-0" />
        Writing the brief…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg font-medium hover:text-ink"
      >
        <Sparkles aria-hidden className="size-4 shrink-0" />
        AI brief
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-2 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
      </button>
      {open && <Brief id={panelId} summary={summary} />}
    </div>
  );
}

function Brief({ id, summary }: { id: string; summary: Summary }) {
  return (
    <div id={id} className="flex flex-col gap-3 rounded-xl border border-line px-3.5 py-3">
      {summary.description && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">What to make</h3>
          <p className="text-sm break-words text-ink">{summary.description}</p>
        </div>
      )}
      <Section title="Watch out for" items={summary.watch_outs} />
      <Section title="Recommendations" items={summary.recommendations} />
      {summary.production_days !== null && (
        <p className="text-sm font-medium tabular-nums">{`About ${summary.production_days} working ${summary.production_days === 1 ? "day" : "days"}`}</p>
      )}
    </div>
  );
}
