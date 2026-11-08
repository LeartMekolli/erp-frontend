"use client";

import { noAnswer } from "@/components/auth/copy";
import { Button } from "@/components/ui/button";
import { isApiProblem } from "@/lib/api/problem";
import { OfflineError } from "@/lib/session/client-session";

/** Why part of the page couldn't load, with a way to try again. */
export function LoadFailure({ error, fallback, onRetry }: { error: unknown; fallback: string; onRetry: () => void }) {
  const message = error instanceof OfflineError ? noAnswer() : (isApiProblem(error) && error.detail) || fallback;
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <p className="text-sm text-ink">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
