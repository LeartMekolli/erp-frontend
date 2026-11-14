"use client";

import { notFound, useParams } from "next/navigation";

import { ComingSoon } from "@/components/shell/coming-soon";
import { useCan } from "@/lib/auth/permissions";

/** `/orders/new` and `/orders/:id`: not built yet. */
export default function OrderSubpage() {
  const { rest } = useParams<{ rest: string[] }>();
  const allowed = useCan("order.read");
  if (!allowed) notFound();
  return <ComingSoon title={rest.length === 1 && rest[0] === "new" ? "New order" : "Order"} back={{ href: "/orders", label: "Back to Orders" }} />;
}
