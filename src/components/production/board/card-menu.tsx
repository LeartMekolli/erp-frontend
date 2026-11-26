"use client";

import { MoreHorizontal } from "lucide-react";

import { lineName } from "@/components/production/by-step/line-row";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { StepGroup } from "@/lib/api/schema-types";
import { dropTargets, type DropMove } from "@/lib/production/board";
import { useWorkflowVersion } from "@/lib/production/queries";
import { staffRules } from "@/lib/production/staff";

/**
 * A card's Move to…: the same choices a drag offers (on to the next step, back to a rework step, or Scrap), from
 * the rules of the version the line started on. The keyboard and single-pointer way to move a card.
 */
export function CardMenu({
  line,
  stepKey,
  workflowId,
  onPick,
}: {
  line: StepGroup;
  stepKey: string;
  workflowId: string;
  onPick: (move: DropMove) => void;
}) {
  const version = useWorkflowVersion(workflowId, line.group.workflow.version);
  const steps = version.data?.steps;
  const step = steps?.find((candidate) => candidate.key === stepKey);
  const path = steps?.map((candidate) => ({ key: candidate.key, name: candidate.name })) ?? [];
  const targets = step ? dropTargets(staffRules(step, path), path) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={!targets}
          aria-label={`Move ${lineName(line)}…`}
          className="size-11 text-ink-2 md:size-9 pointer-coarse:size-11"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      {targets && (
        <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
          <DropdownMenuItem className="min-h-11 md:min-h-9" onSelect={() => onPick({ kind: "pass" })}>
            {targets.pass ? `Pass to ${targets.pass.name}` : "Finish"}
          </DropdownMenuItem>
          {targets.rework.map((back) => (
            <DropdownMenuItem
              key={back.key}
              className="min-h-11 md:min-h-9"
              onSelect={() => onPick({ kind: "fail", target: { kind: "rework", step: back } })}
            >
              {`Send back to ${back.name}`}
            </DropdownMenuItem>
          ))}
          {targets.scrap && (
            <DropdownMenuItem className="min-h-11 md:min-h-9" onSelect={() => onPick({ kind: "fail", target: { kind: "scrap" } })}>
              Scrap
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
