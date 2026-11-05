"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { noAnswer } from "@/components/auth/copy";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/error-message";
import type { AiRef, MeResponse, SuggestionKind } from "@/lib/api/schema-types";

import { navAllows } from "../nav";

import type { useAsk } from "./use-ask";

/** What each suggested action is called (erp-api `suggestions.ts:7-20`). */
export const ACTION_LABEL: Record<SuggestionKind, string> = {
  offer_job: "Offer the job to a partner",
  chase_invoice: "Chase the invoice",
  release_order: "Release the order",
  contact_customer: "Contact the customer",
  review_partner: "Review the partner",
  review_step: "Review the step",
};

/** Where each kind of cited record opens: its section, and whether the link names the record. */
const REF_TARGETS: Partial<Record<AiRef["type"], { section: string; withId: boolean }>> = {
  order: { section: "orders", withId: true },
  customer: { section: "customers", withId: true },
  partner: { section: "partners", withId: true },
  article: { section: "help", withId: true },
  job: { section: "production", withId: false },
};

/** The page a cited record opens, or null when it has none this person may see. */
export function refHref(ref: Pick<AiRef, "type" | "id">, me: MeResponse): string | null {
  const target = REF_TARGETS[ref.type];
  if (!target || !navAllows(me, target.section)) return null;
  return target.withId ? `/${target.section}/${encodeURIComponent(ref.id)}` : `/${target.section}`;
}

function RefLink({ refItem, me, onGo }: { refItem: AiRef; me: MeResponse; onGo: () => void }) {
  const href = refHref(refItem, me);
  if (!href) return <span>{refItem.label}</span>;
  return (
    <Link href={href} onClick={onGo} className="font-medium text-violet-ink underline-offset-4 hover:underline">
      {refItem.label}
    </Link>
  );
}

function joined(refs: AiRef[], me: MeResponse, onGo: () => void) {
  return refs.map((ref, index) => (
    <Fragment key={`${ref.type}-${ref.id}`}>
      {index > 0 && ", "}
      <RefLink refItem={ref} me={me} onGo={onGo} />
    </Fragment>
  ));
}

/**
 * The answer to one question, in place of the search results. The text is
 * shown as plain text with its line breaks, never as Markdown or HTML.
 */
export function AskAnswer({
  question,
  ask,
  onGo,
}: {
  question: string;
  ask: ReturnType<typeof useAsk>;
  onGo: () => void;
}) {
  const { data: me } = useMe();
  if (!me) return null;
  const { run, state } = ask;

  let body: ReactNode;
  if (ask.error) {
    body = <p className="text-sm text-ink">{errorMessage(ask.error)}</p>;
  } else if (state === "failed") {
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink">{run?.error ?? "The AI couldn't answer this time."}</p>
        <Button variant="secondary" onClick={() => ask.ask(question)}>
          Ask again
        </Button>
      </div>
    );
  } else if (state === "done" && run?.answer) {
    const { text, refs, action } = run.answer;
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm whitespace-pre-line text-ink">{text}</p>
        {refs.length > 0 && <p className="text-sm text-ink-2">About: {joined(refs, me, onGo)}</p>}
        {action && (
          <p className="text-sm text-ink-2">
            Suggested: {ACTION_LABEL[action.kind]}: {joined(action.targets, me, onGo)}
          </p>
        )}
        <p className="text-caption text-ink-2">Each question is answered on its own.</p>
      </div>
    );
  } else {
    body = (
      <p role="status" className="text-sm text-ink-2">
        {ask.offline ? noAnswer() : "Thinking…"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-4">
      <p className="text-sm font-semibold text-ink">{question}</p>
      {body}
    </div>
  );
}
