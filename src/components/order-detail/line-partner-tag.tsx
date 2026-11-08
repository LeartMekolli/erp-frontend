"use client";

import type { LinePartner } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";
import { partnerStatus } from "@/lib/orders/line-partner";
import { workspaceToday } from "@/lib/orders/labels";

const tag = "inline-flex flex-wrap items-center gap-x-1.5 rounded-lg border border-line px-2.5 py-1 text-caption font-medium text-ink";

/** Who has a line: in-house, or a partner with where its offer stands. */
export function LinePartnerTag({ partner, now }: { partner: LinePartner | null; now: number }) {
  const { time, dateTime, timeZone } = useFormat();
  const status = partnerStatus(partner, now);
  if (status.kind === "in_house") return <span className={tag}>In-house</span>;

  let where = "Accepted";
  if (status.kind === "offer_expired") where = "Offer expired";
  if (status.kind === "offered") {
    const { expiresAt } = status;
    const sameDay = expiresAt && workspaceToday(timeZone, Date.parse(expiresAt)) === workspaceToday(timeZone, now);
    where = expiresAt ? `Offered, answer by ${sameDay ? time(expiresAt) : dateTime(expiresAt)}` : "Offered";
  }

  return (
    <span className={tag}>
      <span className="break-words">{status.name}</span>
      <span aria-hidden>·</span>
      <span className="font-normal text-ink-2">{where}</span>
    </span>
  );
}
