"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/error-message";
import { isApiProblem } from "@/lib/api/problem";
import type { PartnerJob } from "@/lib/api/schema-types";
import { jobTitle } from "@/lib/partner-jobs/labels";
import { useAnswerOffer } from "@/lib/partner-jobs/queries";

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
 * Decline and Accept for one offer. Accept sends at once; Decline asks first.
 * The answer is announced in the partner shell's notice line, and the
 * workshop's jobs fetch again (`useAnswerOffer`'s `onSettled`). Hidden while
 * the workshop is suspended, and until it's known whether it is.
 */
export function OfferActions({
  job,
  onAnswered,
}: {
  job: Pick<PartnerJob, "id" | "product" | "options">;
  onAnswered?: (answer: Answer) => void;
}) {
  const { partnerId, name, suspended } = useWorkshop();
  const { announce } = usePartnerNotice();
  const answer = useAnswerOffer(partnerId);
  const [asking, setAsking] = useState(false);
  // A second click lands before the disabled button renders: only the first one sends.
  const sending = useRef(false);
  // Sent from the dialog: focus goes to the notice, not back to Decline, which leaves with the offer.
  const answered = useRef(false);

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
      setAsking(false);
      announce(gone ? "This offer is no longer open." : errorMessage(error), { focus: gone });
      return;
    } finally {
      sending.current = false;
    }
    setAsking(false);
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
      { focus: true },
    );
    onAnswered?.(choice);
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
      <Button
        variant="outline"
        disabled={answer.isPending}
        onClick={() => {
          answered.current = false;
          setAsking(true);
        }}
      >
        Decline
      </Button>
      <Button disabled={answer.isPending} aria-busy={answer.isPending} onClick={() => void send("accept")}>
        Accept
      </Button>
      <DeclineDialog
        open={asking}
        onOpenChange={setAsking}
        onDecline={() => void send("decline")}
        pending={answer.isPending}
        onCloseAutoFocus={(event) => {
          if (answered.current) event.preventDefault();
        }}
      />
    </div>
  );
}
