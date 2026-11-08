import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { Order } from "@/lib/api/schema-types";

import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { CLERK, FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { LinePanel } from "./line-panel";
import { LineTabs } from "./line-tabs";

const GROUP = groupIdOf(1048, 0);

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

function groupBody(id = GROUP) {
  const answer = fakeState().production.group(id);
  if (!answer.ok) throw new Error("expected a group");
  return answer.body;
}

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderTabs(user = STAFF) {
  return renderAs(
    user,
    <WithMe>
      <p>Signed in</p>
      <LineTabs groupId={GROUP} index={0} />
    </WithMe>,
  );
}

const section = (name: RegExp) => screen.findByRole("button", { name });

afterEach(() => vi.restoreAllMocks());

describe("LineTabs", () => {
  it("shows each step's count, then finished and scrapped", async () => {
    renderTabs();
    const strip = await screen.findByRole("list", { name: "Progress through the steps" });
    const items = within(strip).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "2 Print",
      "4 Finish1 being redone",
      "3 Final QC",
      "1 Packing",
      "1 Finished",
      "1 Scrapped",
    ]);
  });

  it("has Pieces and Quality tabs", async () => {
    renderTabs();
    expect(await screen.findByRole("tab", { name: "Pieces" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Quality" })).toBeInTheDocument();
  });

  it("opens only the first step with pieces", async () => {
    renderTabs();
    expect(await section(/^Print\b/)).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("1/12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Finish\b/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("3/12")).not.toBeInTheDocument();
  });

  it("says how many are being redone at a step", async () => {
    renderTabs();
    expect(await section(/^Finish\b/)).toHaveAccessibleName("Finish 4 · 1 being redone");
  });

  it("loads a step's pieces when it's opened", async () => {
    renderTabs();
    await userEvent.click(await section(/^Finish\b/));
    expect(await screen.findByText("3/12")).toBeInTheDocument();
    expect(screen.getByText("6/12")).toBeInTheDocument();
    expect(screen.queryByText("7/12")).not.toBeInTheDocument();
  });

  it("closes a step when it's clicked again", async () => {
    renderTabs();
    const print = await section(/^Print\b/);
    await screen.findByText("1/12");
    await userEvent.click(print);
    expect(print).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("1/12")).not.toBeInTheDocument();
  });

  it("keeps finished and scrapped pieces in their own groups", async () => {
    renderTabs();
    await userEvent.click(await section(/^Finished\b/));
    const finished = await screen.findByText("11/12");
    expect(finished.closest("li")).toHaveTextContent("Finished");
    await userEvent.click(await section(/^Scrapped\b/));
    const scrapped = await screen.findByText("12/12");
    expect(scrapped.closest("li")).toHaveTextContent("Scrapped");
  });

  it("loads the next page of a step on request", async () => {
    const first = fakeState().production.pieces(new URLSearchParams({ group_id: GROUP, status: "active", step_key: "print" }));
    if (!first.ok) throw new Error("expected pieces");
    const [one, two] = first.body.data;
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders`, ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.get("cursor") ? { data: [two], next_cursor: null } : { data: [one], next_cursor: "next" },
        ),
      ),
    );
    renderTabs();
    await screen.findByText("1/12");
    expect(screen.queryByText("2/12")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show more at Print" }));
    expect(await screen.findByText("2/12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more at Print" })).not.toBeInTheDocument();
  });

  it("offers a retry when progress can't load", async () => {
    server.use(http.get(`${FAKE_API_URL}/workflow/groups/:id`, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })));
    renderTabs();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("is left out without workflow.read", async () => {
    renderTabs(CLERK);
    await screen.findByText("Signed in");
    expect(screen.queryByRole("list", { name: "Progress through the steps" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Pieces" })).not.toBeInTheDocument();
  });
});

describe("LinePanel progress", () => {
  it("doesn't show progress on a line with no group", async () => {
    const parent = order(1049);
    renderAs(
      STAFF,
      <WithMe>
        <LinePanel line={parent.lines[2]!} order={parent} now={Date.now()} index={0} />
      </WithMe>,
    );
    await screen.findByText("In-house");
    expect(screen.queryByRole("tab", { name: "Pieces" })).not.toBeInTheDocument();
  });

  it("asks for only the first five lines of a long order", async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${FAKE_API_URL}/workflow/groups/:id`, ({ params }) => {
        asked.push(String(params.id));
        return HttpResponse.json(groupBody());
      }),
    );
    const parent = order(1048);
    const lines = Array.from({ length: 50 }, (_, position) => ({
      ...parent.lines[0]!,
      id: `33333333-1000-4000-8000-${String(position).padStart(12, "0")}`,
      position,
      group_id: `a0a0a0a0-1000-4000-8000-${String(position).padStart(12, "0")}`,
    }));
    renderAs(
      STAFF,
      <WithMe>
        {lines.map((line, index) => (
          <LinePanel key={line.id} line={line} order={parent} now={Date.now()} index={index} />
        ))}
      </WithMe>,
    );
    await waitFor(() => expect(asked).toHaveLength(5));
    const more = await screen.findAllByRole("button", { name: "Show progress" });
    expect(more).toHaveLength(45);
    await userEvent.click(more[0]!);
    await waitFor(() => expect(asked).toHaveLength(6));
    expect(asked).toHaveLength(new Set(asked).size);
  });
});
