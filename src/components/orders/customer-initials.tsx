import { cn } from "cn";

import { initials } from "@/lib/format/initials";

/** Background and text pairs from the approved sketch; each passes AA for the initials. */
const PAIRS = [
  "bg-lilac text-violet-ink",
  "bg-[#f3d9c4] text-[#6b3d1d]",
  "bg-[#d6ecf7] text-[#1f5a78]",
  "bg-[#e6f2dc] text-[#3d6420]",
  "bg-[#fbe7c9] text-[#7a4a06]",
  "bg-[#f6dbe3] text-[#7a2440]",
  "bg-lilac-2 text-violet-ink",
  "bg-[#dcefeb] text-[#22564d]",
] as const;

/** The same customer always gets the same pair. */
function pairFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PAIRS[hash % PAIRS.length]!;
}

/** A customer's initials in a coloured badge; decoration only, the name is always nearby. */
export function CustomerInitials({
  customer,
  className,
}: {
  customer: { id: string; name: string };
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold",
        pairFor(customer.id),
        className,
      )}
    >
      {initials(customer.name)}
    </span>
  );
}
