"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/auth/permissions";

/** A section that exists in the sidebar but isn't built yet. */
export function ComingSoon({ title, back = true }: { title: string; back?: boolean }) {
  const ordersAllowed = useCan("order.read");
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card px-6 py-7 sm:px-8">
      <h1 className="text-title font-semibold">{title}</h1>
      <p className="text-sm text-ink-2">This part of AMI is coming soon.</p>
      {back && ordersAllowed && (
        <Button asChild variant="link" className="self-start">
          <Link href="/orders">Back to Orders</Link>
        </Button>
      )}
    </section>
  );
}
