import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LineTabs } from "@/components/order-detail/line-tabs";
import { StaffSelectionProvider as StepSelectionProvider } from "@/components/order-detail/staff-pieces";
import { useMe } from "@/components/session/session-gate";
import type { OrderState } from "@/lib/api/schema-types";
import { invalidateProduction } from "@/lib/production/queries";

import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { STAFF, WORKFLOW_READER } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { MoveBar } from "./move-bar";
import { OpenPieceProvider } from "./open-piece";

const GROUP = groupIdOf(1048, 0);

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? (
    <OpenPieceProvider>
      <StepSelectionProvider>{children}</StepSelectionProvider>
    </OpenPieceProvider>
  ) : null;
}

function renderPieces(orderState: OrderState = "in_production", user = STAFF, groupId = GROUP) {
  return renderAs(
    user,
    <WithMe>
      <p>Signed in</p>
      <LineTabs groupId={groupId} index={0} orderState={orderState} />
    </WithMe>,
  );
}

const tick = async (name: string) => userEvent.click(await screen.findByRole("checkbox", { name }));
const open = async (name: RegExp) => userEvent.click(await screen.findByRole("button", { name }));
const bar = () => screen.queryByRole("region", { name: "Selected pieces" });

function pieceAtPrint(index: number): string {
  const answer = fakeState().production.pieces(new URLSearchParams({ group_id: GROUP, step_key: "print", status: "active" }));
  if (!answer.ok) throw new Error("expected pieces");
  return answer.body.data[index]!.id;
}

afterEach(() => vi.restoreAllMocks());

describe("MoveBar", () => {
  const handlers = { onPass: vi.fn(), onFail: vi.fn(), onCorrect: vi.fn() };

  it("says what's selected and where it goes next", () => {
    render(<MoveBar count={3} stepName="Polishing" next={{ name: "Plating" }} disabledReason={null} {...handlers} />);
    expect(screen.getByText("3 pieces at Polishing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pass to Plating" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Fail…" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Correct…" })).toBeEnabled();
  });

  it("finishes at the last step, and counts one piece in the singular", () => {
    render(<MoveBar count={1} stepName="Packing" next={null} disabledReason={null} {...handlers} />);
    expect(screen.getByText("1 piece at Packing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeInTheDocument();
  });

  it("disables every move and says why", () => {
    render(<MoveBar count={1} stepName="Print" next={{ name: "Finish" }} disabledReason="The order is waiting for payment" {...handlers} />);
    expect(screen.getByText("The order is waiting for payment")).toBeInTheDocument();
    for (const name of ["Pass to Finish", "Fail…", "Correct…"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  });
});

describe("selecting pieces", () => {
  it("shows the bar once a piece is picked, and hides it when none are", async () => {
    renderPieces();
    await tick("Select 1/12");
    await tick("Select 2/12");
    expect(within(bar()!).getByText("2 pieces at Print")).toBeInTheDocument();
    expect(within(bar()!).getByRole("button", { name: "Pass to Finish" })).toBeInTheDocument();
    await tick("Select 1/12");
    await tick("Select 2/12");
    expect(bar()).not.toBeInTheDocument();
  });

  it("offers Finish at the last step", async () => {
    renderPieces();
    await open(/^Packing\b/);
    await tick("Select 10/12");
    expect(within(bar()!).getByRole("button", { name: "Finish" })).toBeInTheDocument();
  });

  it("won't pick a piece the person can't work, and says why", async () => {
    fakeState().production.requireSkill("print");
    renderPieces();
    expect(await screen.findByRole("checkbox", { name: "Select 1/12" })).toBeDisabled();
    expect(screen.getAllByText("Needs a skill you don't have")).toHaveLength(2);
  });

  it("replaces the selection when picking at another step", async () => {
    renderPieces();
    await tick("Select 1/12");
    await open(/^Finish\b/);
    await tick("Select 3/12");
    expect(within(bar()!).getByText("1 piece at Finish")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select 1/12" })).not.toBeChecked();
  });

  it("replaces the selection when picking on another line", async () => {
    render2Lines();
    await tick("Select 1/12");
    await tick("Select 1/40");
    expect(screen.getAllByRole("region", { name: "Selected pieces" })).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Select 1/12" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select 1/40" })).toBeChecked();
  });

  it("selects everything loaded at a step, and clears it again", async () => {
    renderPieces();
    await tick("Select all at Print");
    expect(within(bar()!).getByText("2 pieces at Print")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select 2/12" })).toBeChecked();
    await tick("Select all at Print");
    expect(bar()).not.toBeInTheDocument();
  });

  it("drops a piece someone else moved and says so", async () => {
    const { client } = renderPieces();
    await tick("Select 1/12");
    await tick("Select 2/12");
    fakeState().production.move({ kind: "pass", work_order_ids: [pieceAtPrint(0)], at_step: "print" }, null);
    await act(() => invalidateProduction(client));
    expect(await screen.findByText("1 piece at Print")).toBeInTheDocument();
    expect(screen.getByText("1 piece moved on and left your selection.")).toBeInTheDocument();
  });

  it("offers nothing to pick on an order waiting for payment, and says why", async () => {
    renderPieces("awaiting_payment", STAFF, groupIdOf(1045, 0));
    const piece = (await screen.findByText("1/1")).closest("li")!;
    expect(piece).toHaveTextContent("Waiting for payment");
    expect(screen.queryByRole("checkbox", { name: "Select 1/1" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select all at Print" })).toBeDisabled();
    expect(bar()).not.toBeInTheDocument();
  });

  it.each(["shipped", "delivered", "cancelled"] as const)("offers no selection on a %s order", async (state) => {
    renderPieces(state);
    expect(await screen.findByText("1/12")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("offers no selection without workflow.move", async () => {
    renderPieces("in_production", WORKFLOW_READER);
    expect(await screen.findByText("1/12")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("offers no selection on finished pieces", async () => {
    renderPieces();
    await screen.findByText("1/12");
    await open(/^Finished\b/);
    await screen.findByText("11/12");
    expect(screen.queryByRole("checkbox", { name: "Select 11/12" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select all at Finished" })).not.toBeInTheDocument();
  });
});

function render2Lines() {
  return renderAs(
    STAFF,
    <WithMe>
      <LineTabs groupId={GROUP} index={0} orderState="in_production" />
      <LineTabs groupId={groupIdOf(1041, 0)} index={1} orderState="in_production" />
    </WithMe>,
  );
}
