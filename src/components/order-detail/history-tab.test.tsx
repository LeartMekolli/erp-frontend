import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { OpenPieceProvider } from "@/components/production/open-piece";
import { useMe } from "@/components/session/session-gate";
import type { Group, MoveHistory } from "@/lib/api/schema-types";

import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { LineTabs } from "./line-tabs";
import { StaffSelectionProvider as StepSelectionProvider } from "./staff-pieces";
import { StaffHistoryTab as HistoryTab } from "./staff-tabs";

const GROUP = groupIdOf(1048, 0);
const MOVES = `${FAKE_API_URL}/workflow/groups/:id/moves`;

function ok<T>(answer: { ok: true; body: T } | { ok: false }): T {
  if (!answer.ok) throw new Error("expected a body");
  return answer.body;
}

const group = (): Group => ok(fakeState().production.group(GROUP));
const fakeMoves = (params: Record<string, string> = {}): MoveHistory => ok(fakeState().production.moves(GROUP, new URLSearchParams({ limit: "200", ...params })));

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? (
    <OpenPieceProvider>
      <StepSelectionProvider>{children}</StepSelectionProvider>
    </OpenPieceProvider>
  ) : null;
}

function renderTab() {
  renderAs(
    STAFF,
    <WithMe>
      <HistoryTab group={group()} />
    </WithMe>,
  );
}

const filter = (name: RegExp) => screen.findByRole("button", { name });

describe("HistoryTab", () => {
  it("lists the line's moves", async () => {
    renderTab();
    expect(await screen.findByText("Failed at Final QC: Porosity")).toBeInTheDocument();
    expect(screen.getByText("Pitted along one edge")).toBeInTheDocument();
    expect(await filter(/^All \d+$/)).toHaveAttribute("aria-pressed", "true");
  });

  it("filters to fails and moves back", async () => {
    renderTab();
    await userEvent.click(await filter(/^Fails and moves back 2$/));
    expect(await filter(/^Fails and moves back 2$/)).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.queryByText(/^Passed /)).not.toBeInTheDocument());
    expect(screen.getByText("Failed at Final QC: Porosity")).toBeInTheDocument();
    expect(screen.getByText("Failed at Finish: Scratch")).toBeInTheDocument();
  });

  it("keeps both counts while the other filter loads", async () => {
    const all = fakeMoves().counts.all;
    renderTab();
    await screen.findByText("Failed at Final QC: Porosity");
    server.use(
      http.get(MOVES, ({ request }) => (new URL(request.url).searchParams.get("only") === "fails" ? new Promise<never>(() => {}) : undefined)),
    );
    await userEvent.click(await filter(/^Fails and moves back/));
    expect(await screen.findByRole("status", { name: "Loading this line's moves" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `All ${all}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fails and moves back 2" })).toBeInTheDocument();
  });

  it("says when nothing has moved", async () => {
    server.use(http.get(MOVES, () => HttpResponse.json({ data: [], next_cursor: null, counts: { all: 0, fails: 0 } })));
    renderTab();
    expect(await screen.findByText("No moves yet.")).toBeInTheDocument();
  });

  it("says when no fails match", async () => {
    server.use(
      http.get(MOVES, ({ request }) =>
        new URL(request.url).searchParams.get("only") === "fails"
          ? HttpResponse.json({ data: [], next_cursor: null, counts: { all: 3, fails: 0 } })
          : undefined,
      ),
    );
    renderTab();
    await userEvent.click(await filter(/^Fails and moves back/));
    expect(await screen.findByText("No fails or moves back on this line.")).toBeInTheDocument();
    expect(screen.queryByText("No moves yet.")).not.toBeInTheDocument();
  });

  it("shows earlier moves", async () => {
    const [first, second] = fakeMoves().data;
    const counts = { all: 2, fails: 0 };
    server.use(
      http.get(MOVES, ({ request }) =>
        new URL(request.url).searchParams.get("cursor") === "next"
          ? HttpResponse.json({ data: [second!], next_cursor: null, counts })
          : HttpResponse.json({ data: [first!], next_cursor: "next", counts }),
      ),
    );
    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: "Show earlier moves" }));
    await waitFor(() => expect(screen.getAllByRole("listitem").filter((item) => item.closest("ol"))).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Show earlier moves" })).not.toBeInTheDocument();
  });

  it("offers a retry when the moves can't load", async () => {
    server.use(http.get(MOVES, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })));
    renderTab();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("This line's moves couldn't be loaded.")).toBeInTheDocument();
  });

  it("has a History tab on the line", async () => {
    renderAs(
      STAFF,
      <WithMe>
        <LineTabs groupId={GROUP} index={0} orderState="in_production" />
      </WithMe>,
    );
    const tabs = await screen.findByRole("tablist", { name: "Pieces, quality and history" });
    await userEvent.click(within(tabs).getByRole("tab", { name: "History" }));
    expect(await screen.findByText("Failed at Final QC: Porosity")).toBeInTheDocument();
  });
});
