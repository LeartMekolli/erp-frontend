"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { useNameTaken } from "@/lib/customers/queries";

/**
 * Under New customer's name: says when a customer already has this name, without stopping Create.
 * The link opens that customer in a new tab, so nothing typed here is lost. The live region is always
 * there, so the warning is announced when it appears.
 */
export function NameWarning({ name }: { name: string }) {
  const match = useNameTaken(name);

  return (
    <div role="status" className="empty:-mt-1.5">
      {match && (
        <p className="flex items-start gap-1.5 text-caption text-warn">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span>A customer named {match.name} already exists.</span>{" "}
            <Link
              href={`/customers/${match.id}`}
              target="_blank"
              aria-label={`Open ${match.name} (opens in a new tab)`}
              className="font-semibold text-ink underline underline-offset-3"
            >
              {`Open ${match.name}`}
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}
