import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveBody } from "@/lib/api/schema-types";
import { resetArrivalNotes } from "@/lib/navigation/arrival-note";

import { takeArrivalNote } from "../../../../test/arrival-note";
import { setScreenWidth } from "../../../../test/media";
import { groupIdOf } from "../../../../test/fake-erp-api/orders-seed";
import { FLOOR_WORKER, PRODUCTION_LEAD, STAFF, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

import { ProductionPage } from "@/components/staff-production/production-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/production",
  notFound: vi.fn(),
}));

const LINE_1048 = groupIdOf(1048, 0);
const LINE_1041 = groupIdOf(1041, 0);
const SCRATCH_ID = "b3b3b3b3-0000-4000-8000-000000000001";
const PHOTO_ID = "77777777-0000-4000-8000-000000000009";

let transitions: URL[] = [];
beforeEach(() => {
  transitions = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === "/workflow/transitions") transitions.push(url);
  });
  setScreenWidth(1280);
  resetArrivalNotes();
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.unstubAllGlobals();
});

const at = (group: string, step: string) => {
  const answer = fakeState().production.pieces(new URLSearchParams({ group_id: group, step_key: step, status: "active" }));
  if (!answer.ok) throw new Error(`no pieces at ${step}`);
  return answer.body.data;
};
const orderId = (number: number) => fakeState().orders.all().find((order) => order.number === number)!.id;

function move(body: MoveBody) {
  const answer = fakeState().production.move(body, null);
  if (!answer.ok) throw new Error(`the move didn't go through: ${answer.status}`);
}

/** Scraps one of #1048's pieces at Finish instead of redoing it, with an answer, a photo and a comment. */
function scrapAtFinish() {
  const [piece] = at(LINE_1048, "finish").slice(1);
  move({
    kind: "fail",
    work_order_ids: [piece!.id],
    at_step: "finish",
    defect_id: SCRATCH_ID,
    outcome: "scrap",
    override_reason: "Too deep to save",
    comment: "Deep scratch across the face",
    answers: [{ item: "surface_smooth", value: false }],
    photo_file_version_ids: [PHOTO_ID],
  });
  return piece!;
}

/** Passes three of #1048's pieces and two of #1041's at Final QC in one move. */
function passAcrossTwoLines() {
  move({ kind: "pass", work_order_ids: [...at(LINE_1048, "final_qc").map((piece) => piece.id), ...at(LINE_1041, "final_qc").slice(0, 2).map((piece) => piece.id)], at_step: "final_qc" });
}

/** Opens History as `user` and opens its newest move. */
async function openNewest(user: FakeUser = STAFF) {
  renderAs(user, <ProductionPage />);
  await userEvent.click(await screen.findByRole("tab", { name: "History" }));
  const feed = await screen.findByRole("region", { name: "Moves" });
  const newest = (await within(feed).findAllByRole("article"))[0]!;
  await userEvent.click(within(newest).getByRole("button", { name: /^Details:/ }));
  return newest;
}

describe("An opened move in History", () => {
  it("shows its comment, answers, photo and why its outcome was changed", async () => {
    scrapAtFinish();
    const opened = await openNewest();
    expect(within(opened).getByText("Deep scratch across the face")).toBeInTheDocument();
    expect(within(opened).getByText("Surface smooth").nextSibling).toHaveTextContent("No");
    expect(within(opened).getByRole("img", { name: "Photo 1 at Finish" })).toBeInTheDocument();
    expect(within(opened).getByText("Scrapped instead of redone: Too deep to save")).toBeInTheDocument();
  });

  it("lists each line's pieces under that line, read line by line from erp-api, even with a search for one", async () => {
    passAcrossTwoLines();
    renderAs(STAFF, <ProductionPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "History" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search order, product or customer" }), "1048");
    const feed = await screen.findByRole("region", { name: "Moves" });
    await waitFor(() => expect(within(feed).getAllByRole("article")[0]).toHaveAccessibleName(/passed, at Final QC$/));
    const opened = within(feed).getAllByRole("article")[0]!;
    await userEvent.click(within(opened).getByRole("button", { name: /^Details:/ }));

    const of1048 = await within(opened).findByRole("list", { name: "#1048 · 3 pieces" });
    const of1041 = within(opened).getByRole("list", { name: "#1041 · 2 pieces" });
    await waitFor(() => expect(within(of1048).getAllByRole("link")).toHaveLength(3));
    await waitFor(() => expect(within(of1041).getAllByRole("link")).toHaveLength(2));
    const asked = transitions.map((url) => url.searchParams.get("group_id")).sort();
    expect(asked).toEqual([LINE_1041, LINE_1048].sort());
    expect(new Set(transitions.map((url) => url.searchParams.get("move_id"))).size).toBe(1);
  });

  it("links each piece to its order, leaving the piece for the order page out of sight", async () => {
    const piece = scrapAtFinish();
    const opened = await openNewest();
    const link = await within(opened).findByRole("link", { name: `#1048 · ${piece.label}` });
    const path = `/orders/${orderId(1048)}`;
    expect(link).toHaveAttribute("href", path);
    await userEvent.click(link);
    expect(takeArrivalNote(path)).toEqual({ piece: piece.id });
  });

  it("names pieces without linking them for someone who can't read orders", async () => {
    const piece = scrapAtFinish();
    const opened = await openNewest(FLOOR_WORKER);
    const pieces = await within(opened).findByRole("list", { name: /pieces?$/ });
    await waitFor(() => expect(pieces).toHaveTextContent(piece.label));
    expect(within(pieces).queryByRole("link")).not.toBeInTheDocument();
  });

  it("counts the photos in words for someone who may not see them", async () => {
    scrapAtFinish();
    const opened = await openNewest(PRODUCTION_LEAD);
    expect(within(opened).getByText("1 photo")).toBeInTheDocument();
    expect(within(opened).queryByRole("img")).not.toBeInTheDocument();
  });
});
