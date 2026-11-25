"use client";

import { keepVersion, type LineSelection } from "@/lib/production/line-selection";

import { useMoveFlow, type MoveFlowArgs } from "../move-flow/use-move-flow";

import { SelectionBar } from "./selection-bar";

/**
 * The bar for By step's picked lines, and the move dialog its buttons open (`useMoveFlow`, shared with the
 * Board). The rules come from the version the picked lines started on; lines on different versions must be
 * narrowed to one first.
 */
export function MoveFlow(props: Omit<MoveFlowArgs, "selection"> & { selection: LineSelection }) {
  const { selection, lines, onSelection } = props;
  const flow = useMoveFlow(props);
  return (
    <>
      <SelectionBar
        selection={selection}
        lines={lines}
        next={flow.next}
        targets={flow.targets}
        blockedReason={flow.blockedReason}
        busy={flow.busy}
        versions={flow.versions}
        onPass={() => void flow.start("pass")}
        onTarget={(target) => void flow.start("fail", target)}
        onKeepVersion={(kept) => onSelection((current) => (current ? keepVersion(current, kept) : current))}
        onClear={() => onSelection(() => null)}
      />
      {flow.dialog}
    </>
  );
}
