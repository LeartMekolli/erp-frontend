"use client";

import Link from "next/link";

import { orderHref } from "@/components/orders/order-row";
import type { JobOrder } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { orderRef } from "@/lib/partners/labels";

/**
 * The order and line a job is from, as `Order #1042 · line 2`: a link to the order for staff with
 * `order.read`, plain text otherwise, and nothing for a job with no order (one straight from a quote).
 */
export function JobOrderRef({ order }: { order: JobOrder | null }) {
  const canReadOrders = useCan("order.read");
  if (!order) return null;
  const words = orderRef(order);
  if (!canReadOrders) return <span className="text-sm text-ink-2 tabular-nums">{words}</span>;
  return (
    <Link
      href={orderHref(order)}
      className="inline-flex min-h-11 items-center self-start rounded-sm text-sm text-ink-2 tabular-nums underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-violet"
    >
      {words}
    </Link>
  );
}
