import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionPage } from "@/components/staff-production/production-page";
import type { StepGroup, WorkOrderListItem } from "@/lib/api/schema-types";

import { groupIdOf } from "../../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, STAFF, WORKFLOW_READER } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/production",
  notFound: vi.fn(),
}));

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";

let moves: { body: unknown; key: string | null }[] = [];

beforeEach(() => {
  moves = [];
  server.events.on("request:start", async ({ request }) => {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/workflow/moves") {
      moves.push({ body: await request.clone().json(), key: request.headers.get("Idempotency-Key") });
    }
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

const tab = (name: RegExp) => screen.getByRole("tab", { name });
const lineBox = (name: string) => screen.getByRole("checkbox", { name: `Select ${name}` });
const bar = () => screen.getByRole("region", { name: "Picked lines" });

/** The active pieces of a seeded line at a step, as the fake holds them. */
function piecesOf(number: number, stepKey: string): WorkOrderListItem[] {
  const answer = fakeState().production.pieces(new URLSearchParams({ group_id: groupIdOf(number, 0), step_key: stepKey, status: "active" }));
  if (!answer.ok) throw new Error("no pieces");
  return answer.body.data;
}

async function openAt(step: RegExp) {
  const rendered = renderAs(STAFF, <ProductionPage />);
  await waitFor(() => expect(tab(/^Print/)).toHaveAttribute("aria-selected", "true"));
  if (!step.test("Print")) await userEvent.click(tab(step));
  return rendered;
}

async function tickLine(name: string) {
  await userEvent.click(await screen.findByRole("checkbox", { name: `Select ${name}` }));
  await waitFor(() => expect(lineBox(name)).toHaveAttribute("aria-checked", "true"));
}

describe("By step's moves", () => {
  it("sums up the picked lines and offers what can be done with them", async () => {
    await openAt(/^Finish/);
    await tickLine("#1041");
    await tickLine("#1048");
    expect(bar()).toHaveTextContent("2 lines · 24 pieces");
    expect(bar()).toHaveTextContent("all 20 of #1041, all 4 of #1048");
    expect(bar()).toHaveAttribute("data-move-bar");
    expect(screen.getByRole("tabpanel", { name: "Lines at Finish" })).toHaveAttribute("id", tab(/^Finish/).getAttribute("aria-controls"));
    expect(within(bar()).getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(await within(bar()).findByRole("button", { name: "Pass to Final QC" })).toBeEnabled();
    await userEvent.click(within(bar()).getByRole("button", { name: "Move to…" }));
    expect(await screen.findByRole("menuitem", { name: "Send back to Finish" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Scrap" })).toBeInTheDocument();
  });

  it("says how much of a line is picked", async () => {
    await openAt(/^Finish/);
    await tickLine("#1048");
    await userEvent.click(screen.getByRole("button", { name: "Pieces of #1048" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select 4/12" }));
    expect(bar()).toHaveTextContent("1 line · 3 pieces");
    expect(bar()).toHaveTextContent("3 of 4 pieces of #1048");
  });

  it("passes every picked piece in one move", async () => {
    await openAt(/^Finish/);
    await tickLine("#1041");
    await tickLine("#1048");
    await userEvent.click(await within(bar()).findByRole("button", { name: "Pass to Final QC" }));
    const dialog = await screen.findByRole("dialog", { name: "Pass 24 pieces at Finish" });
    expect(within(dialog).getByText("This counts for Northcast Foundry")).toBeInTheDocument();
    await userEvent.click(within(within(dialog).getByRole("group", { name: "Surface smooth" })).getByRole("radio", { name: "Yes" }));
    await userEvent.upload(within(dialog).getByLabelText("Photos"), new File(["x"], "photo.jpg", { type: "image/jpeg" }));
    // A real upload through the fake storage: slow work, not a race.
    await within(dialog).findByRole("button", { name: "Remove photo.jpg" }, { timeout: 4_000 });
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass to Final QC" }));
    expect(await screen.findByText("24 pieces passed to Final QC.")).toBeInTheDocument();
    expect(moves).toHaveLength(1);
    expect((moves[0]!.body as { work_order_ids: string[] }).work_order_ids).toHaveLength(24);
    expect(moves[0]!.key).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Picked lines" })).not.toBeInTheDocument();
    await waitFor(() => expect(tab(/^Finish/)).toHaveTextContent("Finish 0"));
    await waitFor(() => expect(tab(/^Finish/)).toHaveFocus());
  });

  it("sends back or scraps through the dialog, at the chosen step", async () => {
    await openAt(/^Finish/);
    await tickLine("#1041");
    await userEvent.click(within(bar()).getByRole("button", { name: "Move to…" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Send back to Finish" }));
    const back = await screen.findByRole("dialog", { name: "Send 20 pieces back to Finish" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(back).not.toBeInTheDocument());
    await userEvent.click(within(bar()).getByRole("button", { name: "Move to…" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Scrap" }));
    expect(await screen.findByRole("dialog", { name: "Scrap 20 pieces" })).toBeInTheDocument();
  });

  it("says when someone else moved some of the picked pieces first, and keeps the rest", async () => {
    await openAt(/^Print/);
    await tickLine("#1041");
    await tickLine("#1048");
    expect(bar()).toHaveTextContent("2 lines · 12 pieces");
    await userEvent.click(await within(bar()).findByRole("button", { name: "Pass to Finish" }));
    const dialog = await screen.findByRole("dialog", { name: "Pass 12 pieces at Print" });
    const taken = piecesOf(1041, "print").slice(0, 2).map((piece) => piece.id);
    fakeState().production.move({ kind: "pass", work_order_ids: taken, at_step: "print" }, null);
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass to Finish" }));
    expect(await screen.findByText("Someone already moved 2 of these. The list is up to date now.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(bar()).toHaveTextContent("2 lines · 10 pieces"));
    await waitFor(() => expect(tab(/^Print/)).toHaveTextContent("Print 24"));
  });

  it("shows the fake's refusal when the line comes to wait for its parts while the dialog is open, and keeps it picked", async () => {
    await openAt(/^Print/);
    await tickLine("#1048");
    await userEvent.click(await within(bar()).findByRole("button", { name: "Pass to Finish" }));
    const dialog = await screen.findByRole("dialog", { name: "Pass 2 pieces at Print" });
    // A part sent back for rework meanwhile: the assembly's parts aren't ready any more.
    fakeState().production.waitForParts(groupIdOf(1048, 0));
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass to Finish" }));
    expect(await within(dialog).findByText(/The parts are not ready yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Someone already moved/)).not.toBeInTheDocument();
    // The open dialog hides the page from the accessibility tree: close it to read the bar.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(bar()).toHaveTextContent("1 line · 2 pieces");
  });

  it("after a move, puts focus on the row where the moved line was", async () => {
    await openAt(/^Print/);
    await screen.findByRole("checkbox", { name: "Select #1041" });
    const before = screen.getAllByRole("checkbox");
    const at = before.indexOf(lineBox("#1041"));
    await tickLine("#1041");
    await userEvent.click(await within(bar()).findByRole("button", { name: "Pass to Finish" }));
    const dialog = await screen.findByRole("dialog", { name: "Pass 10 pieces at Print" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Pass to Finish" }));
    expect(await screen.findByText("10 pieces passed to Finish.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Select #1041" })).not.toBeInTheDocument());
    await waitFor(() => {
      const after = screen.getAllByRole("checkbox");
      expect(after[Math.min(at, after.length - 1)]).toHaveFocus();
    });
  });

  it("keeps Pass focusable, but unavailable, while the picked pieces are read", async () => {
    await openAt(/^Finish/);
    await tickLine("#1048");
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders`, async () => {
        await gate;
        return undefined;
      }),
    );
    const pass = await within(bar()).findByRole("button", { name: "Pass to Final QC" });
    await userEvent.click(pass);
    expect(await within(bar()).findByText("Getting the pieces ready…")).toBeInTheDocument();
    expect(pass).toHaveAttribute("aria-disabled", "true");
    expect(pass).toBeEnabled();
    expect(pass).toHaveFocus();
    await userEvent.click(pass);
    release();
    expect(await screen.findByRole("dialog", { name: "Pass 4 pieces at Finish" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("moves to the busiest step when the picked one drops out of the counts", async () => {
    const { client } = await openAt(/^Finish/);
    await tickLine("#1048");
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/counts`, ({ request }) => {
        const answer = fakeState().production.counts(new URL(request.url).searchParams);
        if (!answer.ok) throw new Error("no counts");
        return HttpResponse.json({ steps: answer.body.steps.filter((step) => step.key !== "finish") });
      }),
    );
    await client.invalidateQueries({ queryKey: ["production"] });
    expect(await screen.findByText("Nothing is left at Finish.")).toBeInTheDocument();
    await waitFor(() => expect(tab(/^Print/)).toHaveAttribute("aria-selected", "true"));
    expect(screen.queryByRole("region", { name: "Picked lines" })).not.toBeInTheDocument();
  });

  it("doesn't open the dialog when a picked line can't be read again", async () => {
    await openAt(/^Print/);
    await tickLine("#1041");
    await tickLine("#1048");
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders`, ({ request }) =>
        new URL(request.url).searchParams.get("group_id") === groupIdOf(1048, 0)
          ? HttpResponse.json({ type: "about:blank", title: "Unavailable", status: 503 }, { status: 503, headers: { "content-type": "application/problem+json" } })
          : undefined,
      ),
    );
    await userEvent.click(await within(bar()).findByRole("button", { name: "Pass to Finish" }));
    expect(await screen.findByText("Some pieces couldn't be loaded. Try again.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bar()).toHaveTextContent("2 lines · 12 pieces");
  });

  it("puts focus on the step when the picked pieces turn out to have moved on", async () => {
    await openAt(/^Print/);
    await userEvent.click(await screen.findByRole("button", { name: "Pieces of #1041" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select 1/40" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select 2/40" }));
    expect(bar()).toHaveTextContent("1 line · 2 pieces");
    const taken = piecesOf(1041, "print").slice(0, 2).map((piece) => piece.id);
    fakeState().production.move({ kind: "pass", work_order_ids: taken, at_step: "print" }, null);
    await userEvent.click(await within(bar()).findByRole("button", { name: "Pass to Finish" }));
    expect(await screen.findByText("2 pieces moved on and left your selection.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Picked lines" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(tab(/^Print/)).toHaveFocus());
  });

  it("won't move lines on different versions of the workflow together, and can keep one", async () => {
    const answer = fakeState().production.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "finish", sort: "due_on" }));
    if (!answer.ok) throw new Error("no lines");
    const [first, second] = answer.body.data as [StepGroup, StepGroup];
    const newer: StepGroup = { ...second, group: { ...second.group, workflow: { ...second.group.workflow, version: 2 } } };
    const version = fakeState().production.version(WORKFLOW_ID, 1);
    if (!version.ok) throw new Error("no version");
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, ({ request }) =>
        new URL(request.url).searchParams.get("step_key") === "finish" ? HttpResponse.json({ data: [first, newer], next_cursor: null }) : undefined,
      ),
      http.get(`${FAKE_API_URL}/workflow/workflows/${WORKFLOW_ID}/versions/2`, () => HttpResponse.json({ ...version.body, number: 2 })),
    );
    await openAt(/^Finish/);
    await tickLine("#1041");
    await tickLine("#1048");
    expect(bar()).toHaveTextContent("These are on different versions of the workflow and can't move together");
    // The button names the next step once the workflow's path has loaded.
    expect(await within(bar()).findByRole("button", { name: "Pass to Final QC" })).toBeDisabled();
    expect(within(bar()).getByRole("button", { name: "Move to…" })).toBeDisabled();
    await userEvent.click(within(bar()).getByRole("button", { name: "Keep version 2 only" }));
    expect(bar()).toHaveTextContent("1 line · 4 pieces");
    expect(await within(bar()).findByRole("button", { name: "Pass to Final QC" })).toBeEnabled();
  });

  it("takes at most 1,000 pieces a move", async () => {
    const [template] = piecesOf(1041, "finish");
    const many: WorkOrderListItem[] = Array.from({ length: 1001 }, (_, n) => ({ ...template!, id: `f0f0f0f0-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, label: `${n + 1}/1001` }));
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("group_id") !== groupIdOf(1041, 0)) return undefined;
        const offset = Number(params.get("cursor") ?? 0);
        return HttpResponse.json({ data: many.slice(offset, offset + 200), next_cursor: offset + 200 < many.length ? String(offset + 200) : null });
      }),
    );
    await openAt(/^Finish/);
    await tickLine("#1041");
    expect(bar()).toHaveTextContent("A move takes up to 1,000 pieces. Untick some to go on.");
    expect(await within(bar()).findByRole("button", { name: "Pass to Final QC" })).toBeDisabled();
  });

  it("clears the picked lines on another step", async () => {
    await openAt(/^Finish/);
    await tickLine("#1041");
    await userEvent.click(tab(/^Print/));
    expect(screen.queryByRole("region", { name: "Picked lines" })).not.toBeInTheDocument();
    await userEvent.click(tab(/^Finish/));
    expect(await screen.findByRole("checkbox", { name: "Select #1041" })).toHaveAttribute("aria-checked", "false");
  });

  it("clears the picked lines when they've all left the step, says so, and puts focus on the step", async () => {
    const { client } = await openAt(/^Final QC/);
    await tickLine("#1048");
    // Seeded order 1045 waits for payment, so the fake refuses its moves: #1048 leaves Final QC instead.
    const moved = fakeState().production.move({ kind: "pass", work_order_ids: piecesOf(1048, "final_qc").map((piece) => piece.id), at_step: "final_qc" }, null);
    expect(moved.ok).toBe(true);
    await client.invalidateQueries({ queryKey: ["production"] });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Picked lines" })).not.toBeInTheDocument());
    expect(screen.getByText("The picked lines have moved on, so nothing is picked now.")).toBeInTheDocument();
    await waitFor(() => expect(tab(/^Final QC/)).toHaveFocus());
    // Anything the person changes next clears it.
    await userEvent.click(tab(/^Print/));
    expect(screen.queryByText("The picked lines have moved on, so nothing is picked now.")).not.toBeInTheDocument();
  });

  it("keeps the picked lines, and the person's place, while a search hides them", async () => {
    await openAt(/^Print/);
    await tickLine("#1048");
    const search = screen.getByRole("searchbox", { name: "Search order, product or customer" });
    await userEvent.type(search, "1041");
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Select #1048" })).not.toBeInTheDocument());
    await screen.findByRole("checkbox", { name: "Select #1041" });
    expect(bar()).toHaveTextContent("1 line · 2 pieces");
    // Hidden, but still named.
    expect(bar()).toHaveTextContent("all 2 of #1048");
    expect(search).toHaveFocus();
  });

  it("offers nothing to pick without workflow.move", async () => {
    renderAs(WORKFLOW_READER, <ProductionPage />);
    await screen.findByRole("link", { name: "#1045" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Picked lines" })).not.toBeInTheDocument();
  });

  it("can't move while offline", async () => {
    await openAt(/^Finish/);
    await tickLine("#1041");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => expect(bar()).toHaveTextContent("You're offline."));
    expect(within(bar()).getByRole("button", { name: "Pass to Final QC" })).toBeDisabled();
    expect(within(bar()).getByRole("button", { name: "Move to…" })).toBeDisabled();
  });
});
