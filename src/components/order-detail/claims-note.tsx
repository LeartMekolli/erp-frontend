"use client";

import type { Claim } from "@/lib/api/schema-types";
import { useOrderClaims } from "@/lib/orders/comments";

import { Panel } from "./payment-panel";

/** Still waiting on someone: a decided or closed claim needs nothing more. */
const OPEN: Claim["state"][] = ["open", "awaiting_return"];

/** How many claims on this order are still open. It links nowhere until there's a Claims screen. */
export function ClaimsNote({ orderId }: { orderId: string }) {
  const claims = useOrderClaims(orderId);
  const open = claims.data?.filter((claim) => OPEN.includes(claim.state)).length ?? 0;
  if (open === 0) return null;
  return (
    <Panel title="Claims">
      <p className="text-sm font-medium text-ink tabular-nums">{`${open} open ${open === 1 ? "claim" : "claims"}`}</p>
    </Panel>
  );
}
