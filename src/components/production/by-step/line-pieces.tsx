"use client";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { PieceRow } from "@/components/production/piece-row";
import type { StepGroup } from "@/lib/api/schema-types";
import type { LineSelection } from "@/lib/production/line-selection";
import { useStepPieces } from "@/lib/production/queries";
import type { Piece } from "@/lib/production/shape";
import { staffPiece } from "@/lib/production/staff";

/** An open line's pieces at the step, each with its own tick box. */
export function LinePieces({
  line,
  stepKey,
  selectable,
  selection,
  onTogglePiece,
}: {
  line: StepGroup;
  stepKey: string;
  selectable: boolean;
  /** Already kept to this step by the table. */
  selection: LineSelection | null;
  onTogglePiece: (piece: Piece) => void;
}) {
  const list = useStepPieces(line.group.id, stepKey, "active", true);
  const picked = selection?.lines.get(line.group.id)?.ids;

  if (list.isPending) {
    return (
      <p role="status" className="px-1 py-3 text-sm text-ink-2">
        Loading pieces…
      </p>
    );
  }
  if (list.items.length === 0 && list.isError) {
    return <LoadFailure error={list.error} fallback="The pieces couldn't be loaded." onRetry={() => void list.refetch()} />;
  }

  return (
    <div className="pb-2">
      <ul aria-label="Pieces at this step">
        {list.items.map((item) => {
          const piece = staffPiece(item);
          return (
            <PieceRow
              key={piece.id}
              piece={piece}
              selectable={selectable}
              selected={picked?.has(piece.id) ?? false}
              onToggle={() => onTogglePiece(piece)}
            />
          );
        })}
      </ul>
      <ListEnd list={list} more="Show more pieces" auto={false} />
    </div>
  );
}
