"use client";

import { useState } from "react";

import { busiestWorkflow } from "@/lib/production/by-step";
import { useWorkflowCounts, useWorkflows } from "@/lib/production/queries";

/**
 * The product type (workflow) Production shows, shared by its tabs. Until someone picks one it's the type with
 * the most pieces in progress, read from the unfiltered counts, so a tab's own filters never change which type
 * opens. Once known it's kept: a refetch never moves someone off what they're looking at.
 */
export function useProductType() {
  const workflows = useWorkflows();
  const ids = workflows.data?.map((workflow) => workflow.id) ?? [];
  const counts = useWorkflowCounts(ids, false, null);
  const [picked, setPicked] = useState<string | null>(null);

  const loaded = ids.length > 0 && counts.every((query) => query.data !== undefined);
  // A type whose counts fail can't be weighed: open on the first, where the tab shows the failure with Try again.
  const failed = counts.some((query) => query.isError && query.data === undefined);
  let busiest: string | null = null;
  if (loaded) busiest = busiestWorkflow(ids.map((id, index) => ({ workflowId: id, steps: counts[index]!.data!.steps }))) ?? ids[0]!;
  else if (failed) busiest = ids[0] ?? null;

  if (picked === null && busiest !== null) setPicked(busiest);

  return {
    workflows: workflows.data,
    workflowId: picked ?? busiest,
    setWorkflowId: setPicked,
    isError: workflows.isError,
    error: workflows.error,
    refetch: () => void workflows.refetch(),
    empty: workflows.data?.length === 0,
  };
}
