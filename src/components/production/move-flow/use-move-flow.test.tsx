import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { StepGroup } from "@/lib/api/schema-types";
import { pieceIds, toggleLine, type LineSelection } from "@/lib/production/line-selection";

import { groupIdOf } from "../../../../test/fake-erp-api/orders-seed";
import { STAFF } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

import { useMoveFlow } from "./use-move-flow";

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";
const AT = "final_qc";

let moves: unknown[] = [];

beforeEach(() => {
  moves = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname === "/workflow/moves") moves.push(await request.clone().json());
  });
});
afterEach(() => server.events.removeAllListeners());

/** The fake's lines at Final QC, as erp-api lists them. */
function linesHere(): StepGroup[] {
  const answer = fakeState().production.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: AT }));
  if (!answer.ok) throw new Error("no lines");
  return answer.body.data;
}

/** A line's workable pieces at Final QC, ticked in full. */
function ticked(number: number, previous: LineSelection | null = null): LineSelection {
  const line = linesHere().find((one) => one.group.order?.number === number)!;
  const answer = fakeState().production.pieces(new URLSearchParams({ group_id: groupIdOf(number, 0), step_key: AT, status: "active" }));
  if (!answer.ok) throw new Error("no pieces");
  return toggleLine(previous, AT, line, answer.body.data.filter((piece) => piece.may_work).map((piece) => piece.id))!;
}

function Harness() {
  const [selection, setSelection] = useState<LineSelection | null>(() => ticked(1041));
  const flow = useMoveFlow({
    workflowId: WORKFLOW_ID,
    stepKey: AT,
    selection,
    lines: linesHere(),
    onSelection: (update) => setSelection(update),
    onNotice: () => {},
    onMoved: () => {},
    onCleared: () => {},
    mayUpload: true,
  });
  return (
    <>
      <p data-testid="picked">{selection ? pieceIds(selection).length : 0}</p>
      <button type="button" disabled={!flow.rules} onClick={() => void flow.start("pass", undefined, ticked(1048))}>
        Pass #1048 alone
      </button>
      {flow.dialog}
    </>
  );
}

describe("useMoveFlow", () => {
  it("moves only the lines it's given, and leaves the page's selection as it was", async () => {
    const only = pieceIds(ticked(1048));
    expect(only).toHaveLength(3);
    renderAs(STAFF, <Harness />);
    const button = await screen.findByRole("button", { name: "Pass #1048 alone" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByTestId("picked")).toHaveTextContent("10");
    await userEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Pass 3 pieces at Final QC" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass to Packing" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(moves).toHaveLength(1);
    expect((moves[0] as { work_order_ids: string[] }).work_order_ids).toEqual(only);
    expect(screen.getByTestId("picked")).toHaveTextContent("10");
  });
});
