import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveListItem } from "@/lib/api/schema-types";

import { setScreenWidth } from "../../../../test/media";
import { groupIdOf } from "../../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, FLOOR_WORKER, STAFF } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

import { ProductionPage } from "@/components/staff-production/production-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/production",
  notFound: vi.fn(),
}));

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";
const CAST_ID = "b2b2b2b2-0000-4000-8000-000000000002";
const GROUP = groupIdOf(1048, 0);
const SCRATCH_ID = "b3b3b3b3-0000-4000-8000-000000000001";
const NORTHCAST = { id: "2f1c5d7e-0a9b-4e3c-8d2f-6a5b4c3d2e10", name: "Northcast Foundry" };
const NORA = { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c02", name: "Nora" };

let lists: URL[] = [];
beforeEach(() => {
  lists = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/workflow/moves") lists.push(url);
  });
  setScreenWidth(1280);
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.unstubAllGlobals();
});

const lastList = () => lists.at(-1)!.searchParams;
// A region, not a feed: a feed may hold only articles, and the day headings sit between them.
const feed = () => screen.getByRole("region", { name: "Moves" });
const moves = () => within(feed()).queryAllByRole("article");

/** Opens Production on History, once its moves have loaded. */
async function openHistory(user = STAFF) {
  renderAs(user, <ProductionPage />);
  await userEvent.click(await screen.findByRole("tab", { name: "History" }));
  await waitFor(() => expect(moves().length).toBeGreaterThan(0));
}

/** Northcast's Nora fails three of #1048's pieces at Finish for Scratch, in one move. */
function northcastFails() {
  const answer = fakeState().production.pieces(new URLSearchParams({ group_id: GROUP, step_key: "finish", status: "active" }));
  if (!answer.ok) throw new Error("no piece at Finish");
  const ids = answer.body.data.slice(1, 4).map((piece) => piece.id);
  const moved = fakeState().production.partnerMove(
    { kind: "fail", work_order_ids: ids, at_step: "finish", defect_id: SCRATCH_ID },
    null,
    { actor: NORA, partner: NORTHCAST },
    () => true,
  );
  if (!moved.ok) throw new Error("the fail didn't go through");
}

/** A second product type whose moves no one has made yet. */
function addCastMetal() {
  server.use(
    http.get(`${FAKE_API_URL}/workflow/workflows`, () =>
      HttpResponse.json({
        data: [
          { id: WORKFLOW_ID, key: "standard", name: "Standard production", version: 1 },
          { id: CAST_ID, key: "cast_metal", name: "Cast metal parts", version: 1 },
        ],
      }),
    ),
    http.get(`${FAKE_API_URL}/workflow/work-orders/counts`, ({ request }) =>
      new URL(request.url).searchParams.get("workflow_id") === CAST_ID
        ? HttpResponse.json({ steps: [{ key: "casting", name: "Casting", active: 0, in_rework: 0, workable: 0, held: 0 }] })
        : undefined,
    ),
  );
}

/** `total` copies of a seeded move, served 50 a page as erp-api pages them. */
function manyMoves(total: number) {
  const answer = fakeState().production.moveList(new URLSearchParams());
  if (!answer.ok) throw new Error("no seeded move");
  const template = answer.body.data[0]!;
  const all: MoveListItem[] = Array.from({ length: total }, (_, n) => ({ ...template, id: `d1d1d1d1-0000-4000-8000-${String(n + 1).padStart(12, "0")}` }));
  server.use(
    http.get(`${FAKE_API_URL}/workflow/moves`, ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("cursor")?.split("@")[1] ?? 0);
      return HttpResponse.json({ data: all.slice(offset, offset + 50), next_cursor: offset + 50 < total ? `moves@${offset + 50}` : null });
    }),
  );
}

describe("Production's History", () => {
  it("lists every move as an article, newest first under day headings", async () => {
    northcastFails();
    await openHistory();
    expect(screen.queryByRole("feed")).not.toBeInTheDocument();
    const headings = within(feed()).getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings[0]).toBe("Today");
    expect(new Set(headings).size).toBe(headings.length);
    expect(moves()[0]).toHaveAccessibleName(/^Nora failed: Scratch, sent back to Finish/);
    expect(lastList().get("workflow_id")).toBe(WORKFLOW_ID);
    expect(lastList().get("limit")).toBe("50");
  });

  it("words a fail in full, with its step, its lines and the partner it counted for", async () => {
    northcastFails();
    await openHistory();
    const fail = moves()[0]!;
    const result = within(fail).getByText("failed: Scratch, sent back to Finish");
    expect(result.closest(".font-semibold")).not.toBeNull();
    expect(within(fail).getByText("at Finish")).toBeInTheDocument();
    expect(within(fail).getByRole("list", { name: "Lines" })).toHaveTextContent("#1048 · 3");
    expect(within(fail).getByRole("link", { name: "#1048" })).toHaveAttribute("href", expect.stringMatching(/^\/orders\/[^?#]+$/));
    expect(within(fail).getByText("for Northcast Foundry")).toBeInTheDocument();

    const pass = moves().find((move) => within(move).queryByText("passed"))!;
    expect(within(pass).getByText("passed").closest(".font-semibold")).toBeNull();
  });

  it("says a move made a moment ago was just now, at its exact time", async () => {
    northcastFails();
    await openHistory();
    const time = within(moves()[0]!).getByText("Just now");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  it("asks erp-api for the result, step, defect and search picked", async () => {
    await openHistory();
    await userEvent.click(screen.getByRole("radio", { name: "Failed" }));
    await waitFor(() => expect(lastList().get("kind")).toBe("fail"));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Step" }), "final_qc");
    await waitFor(() => expect(lastList().get("step_key")).toBe("final_qc"));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Defect" }), "porosity");
    await waitFor(() => expect(lastList().get("defect_key")).toBe("porosity"));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search order, product or customer" }), "1048");
    await waitFor(() => expect(lastList().get("q")).toBe("1048"));
    expect(lastList().get("kind")).toBe("fail");
    expect(within(feed()).getAllByRole("article").length).toBeGreaterThan(0);
  });

  it("offers who has moved, workshop people too, to Floor staff, and asks for the one picked", async () => {
    northcastFails();
    await openHistory(FLOOR_WORKER);
    const person = screen.getByRole("combobox", { name: "Person" });
    await waitFor(() => expect(within(person).getByRole("option", { name: "Nora · Northcast Foundry" })).toBeInTheDocument());
    expect(within(person).getAllByRole("option").map((option) => option.textContent)).toEqual(["Anyone", "Ana Ruiz", "Nora · Northcast Foundry"]);
    await userEvent.selectOptions(person, NORA.id);
    await waitFor(() => expect(lastList().get("actor_user_id")).toBe(NORA.id));
  });

  it("clears the step and the person when another product type is picked, and the Board follows it", async () => {
    addCastMetal();
    await openHistory();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Step" }), "final_qc");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Person" }), "55555555-0000-4000-8000-000000000001");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Product type" }), CAST_ID);
    await waitFor(() => expect(lastList().get("workflow_id")).toBe(CAST_ID));
    expect(lastList().has("step_key")).toBe(false);
    expect(lastList().has("actor_user_id")).toBe(false);
    expect(screen.getByRole("combobox", { name: "Step" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Person" })).toHaveValue("");
    await userEvent.click(screen.getByRole("tab", { name: "Board" }));
    expect(await screen.findByRole("combobox", { name: "Product type" })).toHaveValue(CAST_ID);
  });

  it("shows 50 moves, then more, and starts again from the first page when a filter changes", async () => {
    manyMoves(55);
    await openHistory();
    expect(moves()).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(moves()).toHaveLength(55));
    expect(lastList().get("cursor")).toBe("moves@50");
    await userEvent.click(screen.getByRole("radio", { name: "Failed" }));
    await waitFor(() => expect(lastList().get("kind")).toBe("fail"));
    expect(lastList().has("cursor")).toBe(false);
  });

  it("says when the last 7 days have no moves", async () => {
    server.use(http.get(`${FAKE_API_URL}/workflow/moves`, () => HttpResponse.json({ data: [], next_cursor: null })));
    renderAs(STAFF, <ProductionPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "History" }));
    expect(await screen.findByText("No moves in the last 7 days.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("says when nothing matches the filters, and Clear filters goes back to the defaults", async () => {
    await openHistory();
    server.use(http.get(`${FAKE_API_URL}/workflow/moves`, () => HttpResponse.json({ data: [], next_cursor: null })));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Step" }), "packing");
    expect(await screen.findByText("No moves match these filters.")).toBeInTheDocument();
    server.resetHandlers();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(moves().length).toBeGreaterThan(0));
    expect(screen.getByRole("combobox", { name: "Step" })).toHaveValue("");
    expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
    expect(lastList().has("step_key")).toBe(false);
  });

  it("says when History can't load, with Try again", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/workflow/moves`, () =>
        HttpResponse.json({ type: "about:blank", title: "Unavailable", status: 503 }, { status: 503, headers: { "content-type": "application/problem+json" } }),
      ),
    );
    renderAs(STAFF, <ProductionPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "History" }));
    expect(await screen.findByText("History couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("names lines by product and links no order for someone who can't read orders", async () => {
    await openHistory(FLOOR_WORKER);
    const lines = within(moves()[0]!).getByRole("list", { name: "Lines" });
    expect(lines.textContent).not.toMatch(/#\d/);
    expect(within(lines).queryByRole("link")).not.toBeInTheDocument();
  });

  it("puts the filters in a sheet on a phone, counting those set on its button", async () => {
    setScreenWidth(375);
    await openHistory();
    expect(screen.getByRole("group", { name: "Date range" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Result" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Step" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = await screen.findByRole("dialog", { name: "Filters" });
    for (const name of ["Product type", "Step", "Defect", "Person"]) expect(within(sheet).getByRole("combobox", { name })).toBeInTheDocument();
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: "Step" }), "final_qc");
    await userEvent.type(within(sheet).getByRole("searchbox", { name: "Search order, product or customer" }), "1048");
    await userEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("button", { name: "Filters · 2" })).toBeInTheDocument();
    await waitFor(() => expect(lastList().get("q")).toBe("1048"));
    expect(lastList().get("step_key")).toBe("final_qc");
  });
});
