"use client";

import { useState } from "react";

import { api } from "@/lib/api/client";
import { idempotencyHeader } from "@/lib/api/idempotency";
import { problemFrom } from "@/lib/api/problem";
import type { AiRun } from "@/lib/api/schema-types";
import { useApiMutation } from "@/lib/query/use-api-mutation";
import { aiRunState, usePolledJob, type JobState } from "@/lib/query/use-polled-job";

/** erp-api's limit on a question (`run-response.ts:10`). */
export const MAX_QUESTION_LENGTH = 500;

/** A question is checked every half second for its first 10 seconds, then as other work is. */
export const ASK_POLL_DELAYS_MS = [...Array<number>(20).fill(500), 1_000, 2_000, 4_000, 8_000, 10_000] as const;

/**
 * Asks erp-api's AI one question (`POST /ai/ask`, 202 with the run's id),
 * then follows the run (`GET /ai/runs/{id}`) until it is done or failed.
 */
export function useAsk() {
  const [runId, setRunId] = useState<string | null>(null);
  const start = useApiMutation<string, { id: string }>(
    async (question, key) => {
      const { data, error, response } = await api.POST("/ai/ask", { body: { question }, params: { header: idempotencyHeader(key) } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    { onSuccess: (data) => setRunId(data.id) },
  );
  const job = usePolledJob<AiRun>({
    queryKey: ["ai-run", runId],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/ai/runs/{id}", { params: { path: { id: runId ?? "" } } });
      if (!data) throw problemFrom(error, response);
      return data;
    },
    stateOf: (run) => aiRunState(run.status),
    enabled: runId !== null,
    delays: ASK_POLL_DELAYS_MS,
  });

  let state: JobState | "idle" | "loading" = "idle";
  if (start.isPending) state = "loading";
  else if (runId !== null) state = job.state;

  return {
    ask(question: string) {
      setRunId(null);
      start.mutate(question.trim());
    },
    run: runId === null ? undefined : job.data,
    state,
    /** Why the question couldn't be asked: a 409 (no AI limit, or this month's used), or no connection. */
    error: start.error,
    offline: runId !== null && job.offline,
    reset() {
      setRunId(null);
      start.reset();
    },
  };
}
