"use client";

import Link from "next/link";
import { useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/error-message";
import { isApiProblem } from "@/lib/api/problem";
import { jobTitle } from "@/lib/partner-jobs/labels";
import { useAnswerOffer } from "@/lib/partner-jobs/queries";

import { AcceptDialog, type AcceptJob } from "./accept-dialog";
import { DeclineDialog } from "./decline-dialog";
import { partnerHref } from "./nav";
import { usePartnerNotice } from "./notice";
import { useWorkshop } from "./use-workshop";

type Answer = "accept" | "decline";

/** Where a job opens: its Job page. */
export function jobHref(partnerId: string, jobId: string): string {
  return `${partnerHref(partnerId, "jobs")}/${jobId}`;
}

/**
 * Decline and Accept for one offer. Both ask first: Accept with what taking the job means, Decline
 * because it can't be undone. The answer is announced in the partner shell's notice line, a win as a
 * band, and the workshop's jobs fetch again (`useAnswerOffer`'s `onSettled`). Hidden while the
 * workshop is suspended, and until it's known whether it is.
 */
export function OfferActions({ job, onAnswered }: { job: AcceptJob; onAnswered?: (answer: Answer) => void }) {
  const { partnerId, name, suspended } = useWorkshop();
  const { announce } = usePartnerNotice();
  const answer = useAnswerOffer(partnerId);
  // The answer being asked about, if any.
  const [asking, setAsking] = useState<Answer | null>(null);
  // A second click lands before the disabled button renders: only the first one sends.
  const sending = useRef(false);
  // Sent from the dialog: focus goes to the notice, not back to Decline, which leaves with the offer.
  const answered = useRef(false);
  const declineButton = useRef<HTMLButtonElement>(null);
  const acceptButton = useRef<HTMLButtonElement>(null);

  if (suspended || name === null) return null;

  const title = jobTitle(job);

  // An answer takes focus to the notice, because the offer, and so the button, goes. Any other
  // error keeps the offer, so focus stays on it.
  const send = async (choice: Answer) => {
    if (sending.current) return;
    sending.current = true;
    answered.current = true;
    try {
      await answer.mutateAsync({ groupId: job.id, answer: choice });
    } catch (error) {
      const gone = isApiProblem(error) && error.status === 409;
      answered.current = gone;
      setAsking(null);
      announce(gone ? "This offer is no longer open." : errorMessage(error), { focus: gone });
      return;
    } finally {
      sending.current = false;
    }
    setAsking(null);
    announce(
      choice === "accept" ? (
        <>
          <span>{`${title} is yours.`}</span>{" "}
          <Link href={jobHref(partnerId, job.id)} className="font-semibold text-ink underline underline-offset-4">
            Open job
          </Link>
        </>
      ) : (
        `You declined ${title}.`
      ),
      { focus: true, tone: choice === "accept" ? "success" : "plain" },
    );
    onAnswered?.(choice);
  };

  const ask = (choice: Answer) => {
    answered.current = false;
    setAsking(choice);
  };

  // Radix gives focus back only to a DialogTrigger, and these dialogs open by hand, so it's done here,
  // as Pay does. Answered: the offer and its buttons go, so focus stays on the notice instead.
  const focusBack = (button: RefObject<HTMLButtonElement | null>) => (event: Event) => {
    event.preventDefault();
    if (!answered.current) button.current?.focus();
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
      {/* Only the dialogs send, and they wait while sending. These stay enabled, so focus can come back to them. */}
      <Button ref={declineButton} variant="outline" onClick={() => ask("decline")}>
        Decline
      </Button>
      <Button ref={acceptButton} onClick={() => ask("accept")}>
        Accept
      </Button>
      <DeclineDialog
        open={asking === "decline"}
        onOpenChange={(open) => setAsking(open ? "decline" : null)}
        onDecline={() => void send("decline")}
        pending={answer.isPending}
        onCloseAutoFocus={focusBack(declineButton)}
      />
      <AcceptDialog
        job={job}
        open={asking === "accept"}
        onOpenChange={(open) => setAsking(open ? "accept" : null)}
        onAccept={() => void send("accept")}
        pending={answer.isPending}
        onCloseAutoFocus={focusBack(acceptButton)}
      />
    </div>
  );
}
