import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { Group, WorkflowVersion } from "@/lib/api/schema-types";

import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { LineTabs } from "./line-tabs";
import { QualityTab } from "./quality-tab";
import { StepSelectionProvider } from "./use-step-selection";

const GROUP = groupIdOf(1048, 0);
const VERSIONS = `${FAKE_API_URL}/workflow/workflows/:id/versions/:number`;

function ok<T>(answer: { ok: true; body: T } | { ok: false }): T {
  if (!answer.ok) throw new Error("expected a body");
  return answer.body;
}

const group = (): Group => ok(fakeState().production.group(GROUP));
const version = (): WorkflowVersion => {
  const { workflow } = group();
  return ok(fakeState().production.version(workflow.id, workflow.version));
};

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <StepSelectionProvider>{children}</StepSelectionProvider> : null;
}

function renderTab() {
  renderAs(
    STAFF,
    <WithMe>
      <QualityTab group={group()} />
    </WithMe>,
  );
}

const card = (name: string) => screen.findByRole("article", { name });

describe("QualityTab", () => {
  it("has a card for each step with checks, in step order", async () => {
    renderTab();
    await card("Finish");
    expect(screen.getAllByRole("article").map((article) => article.getAttribute("aria-label"))).toEqual(["Finish", "Final QC"]);
  });

  it("names the steps with no checks under the cards", async () => {
    renderTab();
    expect(await screen.findByText("No checks at Print and Packing.")).toBeInTheDocument();
  });

  it("says how many are waiting and being redone", async () => {
    renderTab();
    expect(within(await card("Finish")).getByText("4 waiting, 1 of them being redone")).toBeInTheDocument();
    expect(within(await card("Final QC")).getByText("3 waiting")).toBeInTheDocument();
  });

  it("says a sampled step is sampled", async () => {
    const sampled = version();
    sampled.steps[1]!.sampling = { inspect: 1, of_every: 3 };
    server.use(http.get(VERSIONS, () => HttpResponse.json(sampled)));
    renderTab();
    expect(within(await card("Finish")).getByText("Sampled: 1 of every 3")).toBeInTheDocument();
    expect(within(await card("Final QC")).queryByText(/^Sampled/)).not.toBeInTheDocument();
  });

  it("doesn't link the cards anywhere", async () => {
    renderTab();
    await card("Finish");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows no passed or failed numbers until erp-api has them", async () => {
    renderTab();
    await card("Finish");
    expect(screen.queryByText(/passed|failed/i)).not.toBeInTheDocument();
  });

  it("says when no step has checks", async () => {
    const bare = version();
    for (const step of bare.steps) {
      step.checklist = [];
      step.defects = [];
    }
    server.use(http.get(VERSIONS, () => HttpResponse.json(bare)));
    renderTab();
    expect(await screen.findByText("No step on this line has quality checks.")).toBeInTheDocument();
  });

  it("offers a retry when the checks can't load", async () => {
    server.use(http.get(VERSIONS, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })));
    renderTab();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("opens from the line's tabs", async () => {
    renderAs(
      STAFF,
      <WithMe>
        <LineTabs groupId={GROUP} index={0} orderState="in_production" />
      </WithMe>,
    );
    await userEvent.click(await screen.findByRole("tab", { name: "Quality" }));
    expect(await card("Final QC")).toBeInTheDocument();
  });
});
