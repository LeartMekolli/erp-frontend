"use client";

import { Sparkles } from "lucide-react";
import { useId } from "react";

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
 * The AI's brief for the job, as a panel of the side column: what to make, what to watch out for,
 * what it recommends and about how long it takes. While erp-api writes it the page asks again; a
 * failed or missing brief shows no panel.
 */
export function JobBrief({ summary }: { summary: PartnerJobDetail["summary"] }) {
  const headingId = useId();
  if (summary === null || summary.status === "failed") return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-[20px] bg-card px-5 py-4">
      <h2 id={headingId} className="inline-flex items-center gap-1.5 text-base font-semibold">
        <Sparkles aria-hidden className="size-4 shrink-0" />
        AI brief
      </h2>
      {summary.status === "pending" ? (
        <p role="status" className="text-sm text-ink-2">
          Writing the brief…
        </p>
      ) : (
        <Brief summary={summary} />
      )}
    </section>
  );
}

function Brief({ summary }: { summary: Summary }) {
  return (
    <div className="flex flex-col gap-3">
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
