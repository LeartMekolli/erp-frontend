"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/** A section that exists in the sidebar but isn't built yet. `back` adds a link out, when there's one to offer. */
export function ComingSoon({ title, back = null }: { title: string; back?: { href: string; label: string } | null }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card px-6 py-7 sm:px-8">
      <h1 className="text-title font-semibold">{title}</h1>
      <p className="text-sm text-ink-2">This part of AMI is coming soon.</p>
      {back && (
        <Button asChild variant="link" className="self-start">
          <Link href={back.href}>{back.label}</Link>
        </Button>
      )}
    </section>
  );
}
