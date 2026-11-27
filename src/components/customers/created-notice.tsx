"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { UNKNOWN } from "@/components/auth/copy";
import { Button } from "@/components/ui/button";
import type { SentInvitation } from "@/lib/api/schema-types";
import { useSendInvitation } from "@/lib/customers/queries";

import { saveErrors } from "./save-errors";

/**
 * How long the live region stays empty before its lines go in. A region inserted already holding its text
 * often isn't read by screen readers; one that is in the page first, then filled, is.
 */
const ANNOUNCE_AFTER_MS = 100;

/** Why Send again failed: erp-api's words (a refused email, say), or no answer at all, offline or not. */
function failure(error: unknown): string {
  return saveErrors(error, () => null).message ?? UNKNOWN;
}

/** A line about an invitation whose email wasn't sent: the icon says so as well as the colour. */
function NotSent({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-1.5 text-warn">
      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** The line for what became of the invitation's email. */
function invitationLine(invitation: SentInvitation): string {
  switch (invitation.email_status) {
    case "queued":
      return `An invitation is on its way to ${invitation.email}.`;
    case "no_customer_site":
      return `The invitation to ${invitation.email} wasn't sent: its link goes to the workspace's customer site, and this workspace doesn't have one yet. Send it again here once it does, before you leave this page.`;
    case "failed":
      return `The invitation to ${invitation.email} couldn't be sent.`;
  }
}

/**
 * Right after New customer made a customer, on its page or in New order: says it was created and what
 * became of the first person's invitation email. When it wasn't sent, Send again invites the same email and
 * role once more, which replaces the invitation in erp-api, and the line follows the new answer;
 * `onChange` hands that answer up, so an owner that shows the notice somewhere else next keeps it.
 * The live region is drawn empty and filled a moment later, so it's announced. The box takes focus
 * (`ref`, or itself after Send again succeeds, as the button goes then). `openLink` adds "Open {name}",
 * which opens the customer's page in a new tab so nothing on this one is lost.
 */
export function CreatedNotice({
  customerId,
  name,
  invitation,
  onChange,
  openLink = false,
  ref,
}: {
  customerId: string;
  name: string;
  invitation: SentInvitation | null;
  onChange?: (invitation: SentInvitation) => void;
  openLink?: boolean;
  ref?: Ref<HTMLDivElement | null>;
}) {
  const [shown, setShown] = useState(invitation);
  const [filled, setFilled] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(ref, () => box.current, []);
  const send = useSendInvitation(customerId);
  const notSent = shown !== null && shown.email_status !== "queued";

  useEffect(() => {
    const timer = setTimeout(() => setFilled(true), ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  function sendAgain() {
    if (!shown) return;
    // After a success the same input gets a new Idempotency-Key, so erp-api tries the email again rather than replaying.
    send.mutate(
      { email: shown.email, role: shown.role },
      {
        onSuccess: (answer) => {
          setShown(answer);
          onChange?.(answer);
          // Send again goes once the email is on its way: focus stays in the notice, not on the page body.
          if (answer.email_status === "queued") box.current?.focus();
        },
      },
    );
  }

  return (
    <div
      ref={box}
      tabIndex={-1}
      className="flex flex-col items-start gap-2.5 rounded-lg bg-lilac px-3.5 py-3 text-sm text-violet-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
    >
      <div role="status" className="flex flex-col gap-0.5">
        {filled && (
          <>
            <p>{`${name} was created.`}</p>
            {shown?.email_status === "queued" && <p>{invitationLine(shown)}</p>}
            {shown !== null && shown.email_status !== "queued" && <NotSent>{invitationLine(shown)}</NotSent>}
          </>
        )}
      </div>
      {filled && notSent && (
        <Button
          type="button"
          variant="secondary"
          className="h-9 px-3 pointer-coarse:h-11"
          disabled={send.isPending}
          aria-busy={send.isPending || undefined}
          onClick={sendAgain}
        >
          {send.isPending ? "Sending…" : "Send again"}
        </Button>
      )}
      {notSent && send.isError && (
        <p role="alert" className="text-late-ink">
          {failure(send.error)}
        </p>
      )}
      {filled && openLink && (
        <Link
          href={`/customers/${customerId}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${name} (opens in a new tab)`}
          className="font-semibold text-ink underline underline-offset-3"
        >
          {`Open ${name}`}
        </Link>
      )}
    </div>
  );
}
