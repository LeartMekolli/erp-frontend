"use client";

import { X } from "lucide-react";
import Link from "next/link";

import { submitErrorText } from "@/components/production/submit-error";
import { Button } from "@/components/ui/button";
import type { AiSection } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { useDashboard, useDismissSuggestion, useUndoDismissal, useWriteBriefing } from "@/lib/dashboard/queries";
import { useFormat } from "@/lib/format/use-format";

import { Tile } from "./tile";

type On = Extract<AiSection, { enabled: true }>;
type Target = NonNullable<On["briefing"]>["suggestions"][number]["targets"][number];
type SuggestionKind = NonNullable<On["briefing"]>["suggestions"][number]["kind"];

const OFF: Record<Extract<AiSection, { enabled: false }>["reason"], string> = {
  not_set_up: "AI isn't set up for this workspace.",
  limit_used: "This month's AI limit is used.",
};

const KIND_WORDS: Record<SuggestionKind, string> = {
  offer_job: "Offer a job",
  chase_invoice: "Chase an invoice",
  release_order: "Release an order",
  contact_customer: "Contact a customer",
  review_partner: "Review a partner",
  review_step: "Review a step",
};

/** Where a suggestion's record opens, for the records AMI has a page for; the rest stay words. */
function targetHref(target: Target): string | null {
  switch (target.type) {
    case "order":
      return `/orders/${target.id}`;
    case "partner":
      return `/partners/${target.id}`;
    case "customer":
      return `/customers/${target.id}`;
    default:
      return null;
  }
}

function Targets({ targets }: { targets: Target[] }) {
  return (
    <span className="flex flex-wrap gap-x-2">
      {targets.map((target) => {
        const href = targetHref(target);
        return href ? (
          <Link key={`${target.type}:${target.id}`} href={href} className="font-medium underline underline-offset-2 hover:no-underline">
            {target.label}
          </Link>
        ) : (
          <span key={`${target.type}:${target.id}`} className="font-medium">
            {target.label}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The AI's daily briefing, for staff who may see money and partners. The summary, its suggestions to
 * act on or dismiss for 14 days, and "Write a new one" for staff with `ai.use`: erp-api writes it in the
 * background, so the dashboard is read every few seconds until it's there.
 */
export function BriefingTile() {
  const dashboard = useDashboard();
  const ai = dashboard.data?.ai;
  if (!ai) return null;
  return (
    <Tile span={4} tone="lilac" title="AI briefing" aside={ai.enabled ? <WriteNew ai={ai} /> : null}>
      {ai.enabled ? <Briefing ai={ai} /> : <p className="mt-3 text-sm">{OFF[ai.reason]}</p>}
    </Tile>
  );
}

function WriteNew({ ai }: { ai: On }) {
  const mayWrite = useCan("ai.use");
  const write = useWriteBriefing();
  const { time } = useFormat();
  const writing = ai.pending || write.isPending;

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <p className="flex flex-wrap items-center justify-end gap-x-2 text-caption">
        {ai.briefing && !writing && <span>{`Written ${time(ai.briefing.created_at)}`}</span>}
        {writing ? (
          <span role="status">Writing…</span>
        ) : (
          mayWrite && (
            <Button variant="link" className="min-h-9 text-caption text-violet-ink pointer-coarse:min-h-11" onClick={() => write.mutate(undefined)}>
              Write a new one
            </Button>
          )
        )}
      </p>
      {write.isError && !writing && (
        <p role="alert" className="max-w-64 text-caption text-late-ink">
          {submitErrorText(write.error)}
        </p>
      )}
    </div>
  );
}

function Briefing({ ai }: { ai: On }) {
  const dismiss = useDismissSuggestion();
  const undo = useUndoDismissal();
  const failed = dismiss.isError ? dismiss.error : undo.isError ? undo.error : null;

  return (
    <>
      {ai.briefing ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink">{ai.briefing.summary}</p>
          {ai.briefing.suggestions.length > 0 && (
            <ul role="list" aria-label="Suggestions" className="mt-3 flex flex-col gap-2">
              {ai.briefing.suggestions.map((suggestion) => (
                <li key={suggestion.id} className="flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink">
                  <div className="min-w-0 flex-1">
                    <p>{suggestion.reason}</p>
                    <Targets targets={suggestion.targets} />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Dismiss for 14 days: ${suggestion.reason}`}
                    title="Dismiss for 14 days"
                    disabled={dismiss.isPending}
                    onClick={() => dismiss.mutate(suggestion.id)}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm">No briefing yet.</p>
      )}
      {failed !== null && (
        <p role="alert" className="mt-2 text-caption text-late-ink">
          {submitErrorText(failed)}
        </p>
      )}
      {ai.dismissed.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="min-h-9 cursor-pointer content-center font-medium pointer-coarse:min-h-11">{`Dismissed (${ai.dismissed.length})`}</summary>
          <ul role="list" className="mt-1 flex flex-col gap-1.5">
            {ai.dismissed.map((one) => (
              <li key={one.id} className="flex items-center gap-2 text-ink">
                <span className="min-w-0 flex-1">
                  {`${KIND_WORDS[one.kind]}: `}
                  <Targets targets={one.targets} />
                </span>
                <Button variant="secondary" disabled={undo.isPending} onClick={() => undo.mutate(one.id)} aria-label={`Undo: ${KIND_WORDS[one.kind]}`}>
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
