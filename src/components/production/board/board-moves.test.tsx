import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionPage } from "@/components/staff-production/production-page";
import type { StepGroup, WorkOrderListItem } from "@/lib/api/schema-types";

import { groupIdOf } from "../../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, STAFF } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/production",
  notFound: vi.fn(),
}));

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";

let moves: { work_order_ids: string[] }[] = [];
beforeEach(() => {
  moves = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname === "/workflow/moves") moves.push(await request.clone().json());
  });
});
afterEach(() => server.events.removeAllListeners());

const column = (name: string) => screen.getByRole("region", { name });
const bar = () => screen.queryByRole("region", { name: "Picked lines" });

async function renderBoard() {
  renderAs(STAFF, <ProductionPage />);
  await waitFor(() => expect(screen.getByRole("region", { name: "Print" })).toBeInTheDocument());
}

/** A card's Move to… menu, opened. */
async function moveMenu(step: string, number: number) {
  const trigger = await within(column(step)).findByRole("button", { name: `Move #${number}…` });
  await waitFor(() => expect(trigger).toBeEnabled());
  await userEvent.click(trigger);
}

function piecesOf(number: number, stepKey: string): WorkOrderListItem[] {
  const answer = fakeState().production.pieces(new URLSearchParams({ group_id: groupIdOf(number, 0), step_key: stepKey, status: "active" }));
  if (!answer.ok) throw new Error("no pieces");
  return answer.body.data;
}

describe("Board moves without dragging", () => {
  it("passes a card's pieces from its menu, through the dialog", async () => {
    await renderBoard();
    await moveMenu("Finish", 1041);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Pass to Final QC" }));
    const dialog = await screen.findByRole("dialog", { name: "Pass 20 pieces at Finish" });
    await userEvent.click(within(within(dialog).getByRole("group", { name: "Surface smooth" })).getByRole("radio", { name: "Yes" }));
    await userEvent.upload(within(dialog).getByLabelText("Photos"), new File(["x"], "photo.jpg", { type: "image/jpeg" }));
    // A real upload through the fake storage: slow work, not a race.
    await within(dialog).findByRole("button", { name: "Remove photo.jpg" }, { timeout: 4_000 });
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass to Final QC" }));
    expect(await screen.findByText("20 pieces passed to Final QC.")).toBeInTheDocument();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.work_order_ids).toHaveLength(20);
    await waitFor(() => expect(within(column("Final QC")).getByRole("heading", { level: 2 })).toHaveTextContent("Final QC 33"));
  });

  it("sends a card back, or scraps it, from its menu", async () => {
    await renderBoard();
    await moveMenu("Final QC", 1048);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Send back to Finish" }));
    const back = await screen.findByRole("dialog", { name: "Send 3 pieces back to Finish" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(back).not.toBeInTheDocument());
    await moveMenu("Final QC", 1048);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Scrap" }));
    expect(await screen.findByRole("dialog", { name: "Scrap 3 pieces" })).toBeInTheDocument();
  });

  it("offers only where a card can go", async () => {
    await renderBoard();
    await moveMenu("Print", 1041);
    expect(await screen.findByRole("menuitem", { name: "Pass to Finish" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Send back/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Scrap" })).not.toBeInTheDocument();
  });

  it("ticks cards in one column, and a tick in another column starts again", async () => {
    await renderBoard();
    const finish = column("Finish");
    await userEvent.click(await within(finish).findByRole("checkbox", { name: "Select #1041" }));
    await waitFor(() => expect(within(finish).getByRole("checkbox", { name: "Select #1041" })).toHaveAttribute("aria-checked", "true"));
    await userEvent.click(within(finish).getByRole("checkbox", { name: "Select #1048" }));
    await waitFor(() => expect(bar()).toHaveTextContent("2 lines · 24 pieces"));
    await userEvent.click(await within(column("Print")).findByRole("checkbox", { name: "Select #1048" }));
    await waitFor(() => expect(bar()).toHaveTextContent("1 line · 2 pieces"));
    expect(within(finish).getByRole("checkbox", { name: "Select #1041" })).toHaveAttribute("aria-checked", "false");
  });

  it("moves only the card whose menu is used, and keeps the ticked ones", async () => {
    await renderBoard();
    const finalQc = column("Final QC");
    await userEvent.click(await within(finalQc).findByRole("checkbox", { name: "Select #1041" }));
    await waitFor(() => expect(bar()).toHaveTextContent("1 line · 10 pieces"));
    await moveMenu("Final QC", 1048);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Scrap" }));
    expect(await screen.findByRole("dialog", { name: "Scrap 3 pieces" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bar()).toHaveTextContent("1 line · 10 pieces");
  });

  it("offers the steps a line's own workflow version sends it back to", async () => {
    const answer = fakeState().production.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "final_qc" }));
    if (!answer.ok) throw new Error("no lines");
    const older: StepGroup = answer.body.data.find((line) => line.group.order?.number === 1041)!;
    const onTwo: StepGroup = { ...older, group: { ...older.group, workflow: { ...older.group.workflow, version: 2 } } };
    const v1 = fakeState().production.version(WORKFLOW_ID, 1);
    if (!v1.ok) throw new Error("no version");
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, ({ request }) =>
        new URL(request.url).searchParams.get("step_key") === "final_qc" ? HttpResponse.json({ data: [onTwo], next_cursor: null }) : undefined,
      ),
      http.get(`${FAKE_API_URL}/workflow/workflows/${WORKFLOW_ID}/versions/2`, () =>
        HttpResponse.json({
          ...v1.body,
          number: 2,
          steps: v1.body.steps.map((step) => (step.key === "final_qc" ? { ...step, rework_targets: ["print"] } : step)),
        }),
      ),
    );
    await renderBoard();
    await moveMenu("Final QC", 1041);
    expect(await screen.findByRole("menuitem", { name: "Send back to Print" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Send back to Finish" })).not.toBeInTheDocument();
  });

  it("says when a move counts for the partner holding the line", async () => {
    await renderBoard();
    await moveMenu("Finish", 1048);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Pass to Final QC" }));
    const dialog = await screen.findByRole("dialog", { name: "Pass 4 pieces at Finish" });
    expect(within(dialog).getByText("This counts for Northcast Foundry")).toBeInTheDocument();
  });

  it("says when someone else moved some of the pieces first", async () => {
    await renderBoard();
    await moveMenu("Final QC", 1048);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Send back to Finish" }));
    const dialog = await screen.findByRole("dialog", { name: "Send 3 pieces back to Finish" });
    const taken = piecesOf(1048, "final_qc").slice(0, 2).map((piece) => piece.id);
    fakeState().production.move({ kind: "pass", work_order_ids: taken, at_step: "final_qc" }, null);
    await userEvent.selectOptions(within(dialog).getByLabelText("Defect"), "Porosity");
    await userEvent.type(within(dialog).getByLabelText("Comment"), "Pitted");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send back" }));
    expect(await screen.findByText("Someone already moved 2 of these. The list is up to date now.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("still opens the dialog for a pass that asks for something", async () => {
    await renderBoard();
    // Finish has a required checklist item, so the pass can't wait with Undo.
    await moveMenu("Finish", 1041);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Pass to Final QC" }));
    expect(await screen.findByRole("dialog", { name: "Pass 20 pieces at Finish" })).toBeInTheDocument();
    // The open dialog hides the columns from the accessibility tree, so look past it.
    expect(screen.queryByRole("button", { name: "Undo", hidden: true })).not.toBeInTheDocument();
  });

  it("works its menu from the keyboard", async () => {
    await renderBoard();
    const trigger = await within(column("Final QC")).findByRole("button", { name: "Move #1048…" });
    await waitFor(() => expect(trigger).toBeEnabled());
    act(() => trigger.focus());
    await userEvent.keyboard("{Enter}");
    const first = await screen.findByRole("menuitem", { name: "Pass to Packing" });
    await waitFor(() => expect(first).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByRole("dialog", { name: "Send 3 pieces back to Finish" })).toBeInTheDocument();
  });
});

describe("A pass that waits 5 seconds with Undo", () => {
  // Real time still runs, so the fake API and Testing Library's waits work; the 5 seconds are skipped by hand.
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const head = (step: string) => within(column(step)).getByRole("heading", { level: 2 });

  /** #1041's 10 pieces at Print, passed from its menu: Print asks for nothing, so no dialog. */
  async function passAtPrint() {
    await renderBoard();
    const trigger = await within(column("Print")).findByRole("button", { name: "Move #1041…" });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user().click(trigger);
    await user().click(await screen.findByRole("menuitem", { name: "Pass to Finish" }));
    return within(column("Finish")).findByRole("button", { name: "Undo" });
  }

  it("shows the card passing at the next step, and sends nothing yet", async () => {
    const undo = await passAtPrint();
    const card = undo.closest("[data-held]");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("#1041");
    expect(card).toHaveTextContent("Passing…");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Until it's sent, Print still holds the pieces.
    expect(head("Print")).toHaveTextContent("Print 26");
    expect(head("Finish")).toHaveTextContent("Finish 24");
    expect(moves).toHaveLength(0);
    // Leaving the page sends a waiting pass: undo it, or it would land in the next test's fake API.
    await user().click(undo);
    expect(moves).toHaveLength(0);
  });

  it("sends the pass after 5 seconds", async () => {
    await passAtPrint();
    act(() => vi.advanceTimersByTime(5000));
    expect(await screen.findByText("10 pieces passed to Finish.")).toBeInTheDocument();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.work_order_ids).toHaveLength(10);
    await waitFor(() => expect(head("Finish")).toHaveTextContent("Finish 34"));
    expect(head("Print")).toHaveTextContent("Print 16");
    expect(within(column("Finish")).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("sends nothing after Undo, and the card stays where it was", async () => {
    const undo = await passAtPrint();
    act(() => vi.advanceTimersByTime(2000));
    await user().click(undo);
    await waitFor(() => expect(within(column("Finish")).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument());
    act(() => vi.advanceTimersByTime(10_000));
    expect(moves).toHaveLength(0);
    expect(screen.queryByText(/passed to Finish/)).not.toBeInTheDocument();
    expect(within(column("Print")).getByRole("button", { name: "Move #1041…" })).toBeInTheDocument();
    expect(head("Print")).toHaveTextContent("Print 26");
  });

  it("puts the card back, with erp-api's reason, when the pass is refused", async () => {
    await passAtPrint();
    // A part sent back meanwhile: #1041's parts aren't ready any more.
    fakeState().production.waitForParts(groupIdOf(1041, 0));
    act(() => vi.advanceTimersByTime(5000));
    expect(await screen.findByText(/The parts are not ready yet/)).toBeInTheDocument();
    expect(moves).toHaveLength(1);
    expect(screen.queryByText(/passed to Finish/)).not.toBeInTheDocument();
    await waitFor(() => expect(within(column("Finish")).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument());
    expect(head("Print")).toHaveTextContent("Print 26");
  });

  it("sends the pass at once when the person switches to By step", async () => {
    await passAtPrint();
    act(() => vi.advanceTimersByTime(1000));
    await user().click(screen.getByRole("tab", { name: "By step" }));
    await waitFor(() => expect(moves).toHaveLength(1));
    // By step reads the counts after the pass, so the move has landed before the test ends.
    await waitFor(() => expect(screen.getByRole("tab", { name: /^Print/ })).toHaveTextContent("Print 16"));
    act(() => vi.advanceTimersByTime(5000));
    expect(moves).toHaveLength(1);
  });
});
