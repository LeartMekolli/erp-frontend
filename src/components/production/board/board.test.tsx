import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionPage } from "@/components/staff-production/production-page";
import type { StepGroup } from "@/lib/api/schema-types";

import { groupIdOf } from "../../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, STAFF, WORKFLOW_READER, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { fakeState } from "../../../../test/fake-erp-api/state";
import { server } from "../../../../test/msw";
import { renderAs } from "../../../../test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/production",
  notFound: vi.fn(),
}));

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";

let requests: URL[] = [];
beforeEach(() => {
  requests = [];
  server.events.on("request:start", ({ request }) => requests.push(new URL(request.url)));
});
afterEach(() => server.events.removeAllListeners());

const sent = (path: string) => requests.filter((url) => url.pathname === path);
const column = (name: string) => screen.getByRole("region", { name });
const cardNumbers = (name: string) =>
  within(column(name))
    .queryAllByRole("link")
    .map((link) => link.textContent)
    .filter((text) => /^#\d+$/.test(text ?? ""));

async function renderBoard(user: FakeUser = STAFF) {
  renderAs(user, <ProductionPage />);
  await waitFor(() => expect(screen.getByRole("region", { name: "Print" })).toBeInTheDocument());
}

/** The fake's #1041 line at a step, as erp-api lists it. */
function line1041(stepKey: string): StepGroup {
  const answer = fakeState().production.stepGroups(new URLSearchParams({ workflow_id: WORKFLOW_ID, step_key: stepKey }));
  if (!answer.ok) throw new Error("no lines");
  return answer.body.data.find((one) => one.group.order?.number === 1041)!;
}

describe("Board", () => {
  it("shows one column per step with erp-api's count, then Scrap", async () => {
    await renderBoard();
    for (const [name, count] of [["Print", 26], ["Finish", 24], ["Final QC", 13], ["Packing", 1]] as const) {
      expect(within(column(name)).getByRole("heading", { level: 2 })).toHaveTextContent(`${name} ${count}`);
    }
    expect(column("Scrap")).toBeInTheDocument();
  });

  it("lists a step's lines due soonest first, each card saying what it needs", async () => {
    await renderBoard();
    await waitFor(() => expect(cardNumbers("Finish")).toEqual(["#1041", "#1048"]));
    const card = within(column("Finish")).getByRole("link", { name: "#1048" }).closest("li")!;
    expect(card).toHaveTextContent("1 being redone");
    expect(card).toHaveTextContent("With Northcast Foundry");
    expect(card).toHaveTextContent("today");
    expect(card).toHaveTextContent("4 pieces");
  });

  it("says a line waits for payment, with nothing to tick", async () => {
    await renderBoard();
    const card = (await within(column("Print")).findByRole("link", { name: "#1045" })).closest("li")!;
    expect(card).toHaveTextContent("Waiting for payment");
    expect(within(card).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("sorts every column", async () => {
    await renderBoard();
    await waitFor(() => expect(cardNumbers("Finish")).toEqual(["#1041", "#1048"]));
    await userEvent.click(screen.getByRole("button", { name: "Sort: Due soonest" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Due latest" }));
    await waitFor(() => expect(cardNumbers("Finish")).toEqual(["#1048", "#1041"]));
  });

  it("asks only for what the person can work, everywhere", async () => {
    await renderBoard();
    await userEvent.click(screen.getByRole("checkbox", { name: "Only what I can work" }));
    await waitFor(() => expect(sent("/workflow/work-orders/counts").at(-1)?.searchParams.get("workable")).toBe("true"));
    await waitFor(() => {
      const steps = new Set(sent("/workflow/work-orders/groups").filter((url) => url.searchParams.get("workable") === "true").map((url) => url.searchParams.get("step_key")));
      expect([...steps].sort()).toEqual(["final_qc", "finish", "packing", "print"]);
    });
  });

  it("pages a long column, keeping erp-api's count in its head", async () => {
    const base = line1041("final_qc");
    const many: StepGroup[] = Array.from({ length: 55 }, (_, n) => ({
      ...base,
      group: { ...base.group, id: `d0d0d0d0-0000-4000-8000-${String(n).padStart(12, "0")}`, order: { ...base.group.order!, number: 2000 + n } },
    }));
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("step_key") !== "packing") return undefined;
        const offset = Number(url.searchParams.get("cursor") ?? 0);
        return HttpResponse.json({ data: many.slice(offset, offset + 50), next_cursor: offset + 50 < many.length ? String(offset + 50) : null });
      }),
    );
    await renderBoard();
    await waitFor(() => expect(cardNumbers("Packing")).toHaveLength(50));
    await userEvent.click(within(column("Packing")).getByRole("button", { name: /Show more/ }));
    await waitFor(() => expect(cardNumbers("Packing")).toHaveLength(55));
    expect(within(column("Packing")).getByRole("heading", { level: 2 })).toHaveTextContent("Packing 1");
  });

  it("says when nothing waits at a step, and asks erp-api for nothing there", async () => {
    const answer = fakeState().production.pieces(new URLSearchParams({ group_id: groupIdOf(1048, 0), step_key: "packing", status: "active" }));
    if (!answer.ok) throw new Error("no pieces");
    fakeState().production.move({ kind: "pass", work_order_ids: answer.body.data.map((piece) => piece.id), at_step: "packing" }, null);
    await renderBoard();
    expect(await within(column("Packing")).findByText("Nothing here.")).toBeInTheDocument();
    expect(sent("/workflow/work-orders/groups").some((url) => url.searchParams.get("step_key") === "packing")).toBe(false);
  });

  it("says when one column can't load, there only", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, ({ request }) =>
        new URL(request.url).searchParams.get("step_key") === "final_qc"
          ? HttpResponse.json({ type: "about:blank", title: "Unavailable", status: 503 }, { status: 503, headers: { "content-type": "application/problem+json" } })
          : undefined,
      ),
    );
    await renderBoard();
    expect(await within(column("Final QC")).findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    await waitFor(() => expect(cardNumbers("Finish")).toEqual(["#1041", "#1048"]));
  });

  it("counts the pieces left on an older version of the workflow, and lists their lines", async () => {
    const older = { ...line1041("final_qc"), count: 3, workable: 3 };
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/counts`, async ({ request }) => {
        const answer = fakeState().production.counts(new URL(request.url).searchParams);
        if (!answer.ok) return undefined;
        return HttpResponse.json({ steps: [...answer.body.steps, { key: "polish", name: "Polish", active: 3, in_rework: 0, workable: 3, held: 0 }] });
      }),
      http.get(`${FAKE_API_URL}/workflow/work-orders/groups`, ({ request }) =>
        new URL(request.url).searchParams.get("step_key") === "polish" ? HttpResponse.json({ data: [older], next_cursor: null }) : undefined,
      ),
    );
    await renderBoard();
    const note = await screen.findByRole("button", { name: /3 pieces on an older version of this workflow/ });
    expect(note).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(note);
    const list = screen.getByRole("region", { name: "Polish (older version)" });
    expect(await within(list).findByRole("link", { name: "#1041" })).toBeInTheDocument();
  });

  it("offers nothing to tick or move without workflow.move", async () => {
    await renderBoard(WORKFLOW_READER);
    await within(column("Finish")).findByRole("link", { name: "#1041" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Move #/ })).not.toBeInTheDocument();
  });

  it("opens a card to list its pieces at the step", async () => {
    await renderBoard();
    const toggle = await within(column("Finish")).findByRole("button", { name: "Pieces of #1048" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await within(column("Finish")).findByRole("button", { name: "History of 3/12" })).toBeInTheDocument();
  });
});
