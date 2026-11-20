"use client";

import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/shell/coming-soon";
import { useCan } from "@/lib/auth/permissions";

/** Only `/orders/:id/...` lands here: `/orders/new` and `/orders/:id` have their own routes. Not built yet. */
export default function OrderSubpage() {
  const allowed = useCan("order.read");
  if (!allowed) notFound();
  return <ComingSoon title="Order" back={{ href: "/orders", label: "Back to Orders" }} />;
}
