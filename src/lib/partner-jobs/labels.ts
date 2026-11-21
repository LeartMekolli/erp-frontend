import type { PartnerJob } from "@/lib/api/schema-types";
import { formatDateTime, formatDay } from "@/lib/format/dates";
import { daysBetween } from "@/lib/orders/labels";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The product name (or `Job`), then each option's value: `Ring · Silver 925`. */
export function jobTitle(job: Pick<PartnerJob, "product" | "options">): string {
  return [job.product?.name ?? "Job", ...job.options.map((option) => option.value)].join(" · ");
}

export function piecesText(quantity: number): string {
  return `${quantity} ${quantity === 1 ? "piece" : "pieces"}`;
}

export function doneText(job: PartnerJob): string {
  return `${job.pieces.finished} of ${job.quantity} done`;
}

/** Scrapped pieces, which are lost to the job: `1 lost`. Nothing when none are. */
export function lostText(job: Pick<PartnerJob, "pieces">): string | null {
  return job.pieces.scrapped > 0 ? `${job.pieces.scrapped} lost` : null;
}

/** The partner's steps in order: `Print pattern → Casting`. */
export function stepsText(steps: readonly { name: string }[]): string {
  return steps.map((step) => step.name).join(" → ");
}

/** The exact deadline of an offer, in the workspace's time zone. */
export function answerByText(expiresAt: string, timeZone: string): string {
  return `Answer by ${formatDateTime(expiresAt, timeZone)}`;
}

/** The day a job is due, or how many days late it is against the workspace's today. Null without a due day. */
export function dueText(dueOn: string | null, today: string): { text: string; late: boolean } | null {
  if (dueOn === null) return null;
  const late = daysBetween(dueOn, today);
  if (late > 0) return { text: `Late · ${late} ${late === 1 ? "day" : "days"}`, late: true };
  return { text: `Due ${formatDay(dueOn)}`, late: false };
}

/** How long a partner has left to answer an offer. Urgent under 2 hours; over at or past the deadline. */
export function timeLeft(expiresAt: string, now: number): { text: string; urgent: boolean; over: boolean } {
  const left = Date.parse(expiresAt) - now;
  const urgent = left < 2 * HOUR;
  if (left <= 0) return { text: "Time to answer is over", urgent, over: true };

  let text: string;
  if (left >= DAY) {
    const days = Math.floor(left / DAY);
    text = `${days} ${days === 1 ? "day" : "days"} left to answer`;
  } else if (left >= HOUR) {
    text = `${Math.floor(left / HOUR)} h ${Math.floor((left % HOUR) / MINUTE)} min left to answer`;
  } else if (left >= MINUTE) {
    text = `${Math.floor(left / MINUTE)} min left to answer`;
  } else {
    text = "Less than a minute left to answer";
  }
  return { text, urgent, over: false };
}
