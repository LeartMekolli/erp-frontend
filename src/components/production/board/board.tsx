"use client";

export interface BoardProps {
  canMove: boolean;
  canUpload: boolean;
  workflowId: string | null;
  onWorkflow: (workflowId: string) => void;
}

/** The Board: one column per step of a product type. Its columns and cards arrive with the next task. */
export function Board({ workflowId }: BoardProps) {
  return <section aria-label="Board" aria-busy={workflowId === null} className="flex min-h-40 flex-col rounded-[20px] bg-card" />;
}
