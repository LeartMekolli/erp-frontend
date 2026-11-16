import { Clock } from "lucide-react";

import { timeLeft } from "@/lib/partner-jobs/labels";

/**
 * How long is left to answer an offer. Under 2 hours it's urgent: the word
 * `Urgent` and a clock before the text, in the warning colour, so it never
 * relies on colour alone.
 */
export function TimeLeft({ expiresAt, now }: { expiresAt: string; now: number }) {
  const { text, urgent } = timeLeft(expiresAt, now);
  if (!urgent) return <span className="text-sm text-ink-2">{text}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-warn">
      <Clock aria-hidden className="size-4 shrink-0" />
      <span>Urgent</span>
      <span>{text}</span>
    </span>
  );
}
