import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { OpenPieceProvider } from "@/components/production/open-piece";
import type { StepGroup, WorkOrderListItem } from "@/lib/api/schema-types";
import { pieceIds, type LineSelection } from "@/lib/production/line-selection";
import type { StepLinesFilter } from "@/lib/production/queries";

import { groupIdOf } from "../../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, FLOOR_WORKER, STAFF, WORKFLOW_READER, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

import { LinesTable } from "./lines-table";

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";
const FINISH: StepLinesFilter = { workflowId: WORKFLOW_ID, stepKey: "finish", q: null, sort: "due_on", workable: false };
const today = () => new Date().toISOString().slice(0, 10);

function Harness({ selectable, seen, filter }: { selectable: boolean; seen: (selection: LineSelection | null) => void; filter: StepLinesFilter }) {
  const [selection, setSelection] = useState<LineSelection | null>(null);
  return (
    <OpenPieceProvider>
      <LinesTable
        filter={filter}
        stepName="Finish"
        selection={selection}
        onSelection={(update) =>
          setSelection((previous) => {
            const next = update(previous);
            seen(next);
            return next;
          })
        }
        selectable={selectable}
        today={today()}
      />
    </OpenPieceProvider>
  );
}

function renderTable({ user = STAFF, selectable = true, filter = FINISH }: { user?: FakeUser; selectable?: boolean; filter?: StepLinesFilter } = {}) {
  const seen = vi.fn<(selection: LineSelection | null) => void>();
  renderAs(user, <Harness selectable={selectable} seen={seen} filter={filter} />);
  return { seen, last: () => seen.mock.lastCall?.[0] ?? null };
}

const rowOf = async (number: number) => (await screen.findByRole("link", { name: `#${number}` })).closest("tr")!;
const lineBox = (number: number) => screen.getByRole("checkbox", { name: `Select #${number}` });

describe("LinesTable", () => {
  it("lists the order lines at the step, due soonest first, with what they need", async () => {
    renderTable();
    const first = await rowOf(1041);
    const rows = screen.getAllByRole("row").filter((row) => within(row).queryByRole("link"));
    expect(rows[0]).toBe(first);
    expect(first).toHaveTextContent("Fieldnote Studio");
    expect(first).toHaveTextContent("Bracket");
    expect(first).toHaveTextContent("Late");
    expect(first).toHaveTextContent("2 days late");
    expect(first).toHaveTextContent("20 pieces");
    const partner = await rowOf(1048);
    expect(partner).toHaveTextContent("1 being redone");
    expect(partner).toHaveTextContent("With Northcast Foundry");
    expect(screen.getByRole("link", { name: "#1041" })).toHaveAttribute("href", "/orders/22222222-0000-4000-8000-000000001041");
  });

  it("opens a line to list its pieces at the step", async () => {
    renderTable();
    await rowOf(1048);
    const toggle = screen.getByRole("button", { name: "Pieces of #1048" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("checkbox", { name: "Select 3/12" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select 6/12" })).toBeInTheDocument();
  });

  it("ticks every workable piece of a line, and is mixed once one is unticked", async () => {
    const { last } = renderTable();
    await rowOf(1048);
    await userEvent.click(lineBox(1048));
    await waitFor(() => expect(lineBox(1048)).toHaveAttribute("aria-checked", "true"));
    expect(pieceIds(last()!)).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Pieces of #1048" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select 4/12" }));
    expect(lineBox(1048)).toHaveAttribute("aria-checked", "mixed");
    expect(pieceIds(last()!)).toHaveLength(3);
  });

  it("offers to try again when a line's pieces can't be read for its tick", async () => {
    server.use(
      http.get(
        `${FAKE_API_URL}/workflow/work-orders`,
        () => HttpResponse.json({ type: "about:blank", title: "Unavailable", status: 503 }, { status: 503, headers: { "content-type": "application/problem+json" } }),
        { once: true },
      ),
    );
    renderTable();
    await rowOf(1048);
    await userEvent.click(lineBox(1048));
    // The phone cell and the desktop cell each say it; CSS shows one.
    const [retry] = await screen.findAllByRole("button", { name: "Try again to select #1048" });
    expect(lineBox(1048)).toHaveAttribute("aria-checked", "false");
    expect(screen.getAllByText(/Its pieces couldn.t be loaded\./)).not.toHaveLength(0);
    await userEvent.click(retry!);
    await waitFor(() => expect(lineBox(1048)).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByRole("button", { name: "Try again to select #1048" })).not.toBeInTheDocument();
  });

  it("ticks every piece of a line longer than one page", async () => {
    const answer = fakeState().production.pieces(new URLSearchParams({ group_id: groupIdOf(1048, 0), step_key: "finish", status: "active" }));
    if (!answer.ok) throw new Error("no piece");
    const template = answer.body.data[1]!;
    const all: WorkOrderListItem[] = Array.from({ length: 205 }, (_, n) => ({ ...template, id: `d0d0d0d0-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, label: `${n + 1}/205` }));
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("cursor") ?? 0);
        return HttpResponse.json({ data: all.slice(offset, offset + 200), next_cursor: offset + 200 < all.length ? String(offset + 200) : null });
      }),
    );
    const { last } = renderTable();
    await rowOf(1048);
    await userEvent.click(lineBox(1048));
    await waitFor(() => expect(last()).not.toBeNull());
    expect(pieceIds(last()!)).toHaveLength(205);
  });

  it("can't tick a line whose step needs a skill the person lacks", async () => {
    fakeState().production.requireSkill("finish");
    renderTable();
    const row = await rowOf(1048);
    expect(lineBox(1048)).toBeDisabled();
    expect(row).toHaveTextContent("Needs a skill you don't have");
  });

  it("shows no order or customer to staff who can't read them", async () => {
    renderTable({ user: FLOOR_WORKER });
    expect(await screen.findAllByText("Bracket")).not.toHaveLength(0);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Fieldnote Studio")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Bracket" })).toBeInTheDocument();
  });

  it("offers no tick boxes to someone who can't move pieces", async () => {
    renderTable({ user: WORKFLOW_READER, selectable: false });
    await rowOf(1048);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pieces of #1048" }));
    expect(await screen.findByRole("button", { name: "History of 3/12" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("says when nothing waits at the step", async () => {
    renderTable({ filter: { ...FINISH, q: "nothing like this" } });
    expect(await screen.findByText("Nothing waiting at Finish matches your search.")).toBeInTheDocument();
  });

  it("says when the step is empty", async () => {
    server.use(http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, () => HttpResponse.json({ data: [], next_cursor: null })));
    renderTable();
    expect(await screen.findByText("Nothing waiting at Finish.")).toBeInTheDocument();
  });

  it("offers to try again when the lines can't load", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, () =>
        HttpResponse.json({ type: "about:blank", title: "Unavailable", status: 503, detail: "Try again in a moment" }, { status: 503, headers: { "content-type": "application/problem+json" } }),
      ),
    );
    renderTable();
    expect(await screen.findByText("Try again in a moment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows more lines and keeps the ticked ones ticked", async () => {
    const answer = fakeState().production.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: "finish", sort: "due_on" }));
    if (!answer.ok) throw new Error("no lines");
    const [real] = answer.body.data;
    const copies: StepGroup[] = Array.from({ length: 58 }, (_, n) => ({
      ...real!,
      group: { ...real!.group, id: `e0e0e0e0-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, order: { ...real!.group.order!, number: 2000 + n } },
    }));
    const all = [...answer.body.data, ...copies];
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("cursor") ?? 0);
        return HttpResponse.json({ data: all.slice(offset, offset + 50), next_cursor: offset + 50 < all.length ? String(offset + 50) : null });
      }),
    );
    renderTable();
    await rowOf(1041);
    await userEvent.click(lineBox(1041));
    await waitFor(() => expect(lineBox(1041)).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByRole("link", { name: "#2057" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("link", { name: "#2057" })).toBeInTheDocument();
    expect(lineBox(1041)).toHaveAttribute("aria-checked", "true");
  });
});
