import type { PartnerStatus } from "@/lib/api/schema-types";
import { PARTNER_STATUS } from "@/lib/partners/labels";

const DOT: Record<PartnerStatus, string> = { approved: "bg-ship", setting_up: "bg-violet", suspended: "bg-late" };

/** A partner's status as a dot plus the word, never colour alone. */
export function PartnerStatusTag({ status }: { status: PartnerStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption font-medium text-ink">
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[status]}`} />
      {PARTNER_STATUS[status]}
    </span>
  );
}
