import { screen, waitFor, within } from "@testing-library/react";
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

/** The fake group with one step's fields replaced. */
function withStep(key: string, fields: Partial<Group["steps"][number]>): Group {
  const changed = group();
  changed.steps = changed.steps.map((step) => (step.key === key ? { ...step, ...fields } : step));
  return changed;
}

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <StepSelectionProvider>{children}</StepSelectionProvider> : null;
}

function renderTab(shown: Group = group()) {
  renderAs(
    STAFF,
    <WithMe>
      <QualityTab group={shown} />
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

  it("counts passed, failed and waiting, with a bar of the same", async () => {
    renderTab();
    const finish = await card("Finish");
    expect(within(finish).getByText("6 passed · 1 failed · 4 waiting")).toBeInTheDocument();
    expect(within(finish).getByRole("img", { name: "6 passed, 1 failed, 4 waiting" })).toBeInTheDocument();
    expect(within(await card("Final QC")).getByText("2 passed · 1 failed · 3 waiting")).toBeInTheDocument();
  });

  it("says how many waiting pieces are being redone", async () => {
    renderTab();
    expect(within(await card("Finish")).getByText("1 being redone")).toBeInTheDocument();
    expect(within(await card("Final QC")).queryByText(/being redone/)).not.toBeInTheDocument();
  });

  it("puts failures first, in amber with the word", async () => {
    renderTab();
    const finish = await card("Finish");
    expect(within(finish).getByText("1 failed")).toBeInTheDocument();
    expect(finish).toHaveClass("border-collect");
  });

  it("says waiting, all through or not reached when nothing failed", async () => {
    renderTab(withStep("finish", { failed: 0, defects: [], count: 4, in_rework: 0 }));
    expect(within(await card("Finish")).getByText("4 waiting")).toBeInTheDocument();
    expect(await card("Finish")).not.toHaveClass("border-collect");
  });

  it("says all through once no piece is left before the step", async () => {
    const cleared = withStep("finish", { failed: 0, defects: [], count: 0, in_rework: 0 });
    cleared.steps = cleared.steps.map((step) => (step.key === "print" ? { ...step, count: 0 } : step));
    renderTab(cleared);
    expect(within(await card("Finish")).getByText("All through")).toBeInTheDocument();
  });

  it("says how many passed so far while pieces are still at earlier steps", async () => {
    renderTab(withStep("finish", { failed: 0, defects: [], count: 0, in_rework: 0 }));
    const finish = await card("Finish");
    expect(within(finish).getByText("6 passed so far")).toBeInTheDocument();
    expect(within(finish).queryByText("All through")).not.toBeInTheDocument();
  });

  it("says when no piece has reached a step", async () => {
    renderTab(withStep("final_qc", { passed: 0, failed: 0, not_inspected: 0, defects: [], count: 0, latest_check: null }));
    const finalQc = await card("Final QC");
    expect(within(finalQc).getByText("Not reached yet")).toBeInTheDocument();
    expect(within(finalQc).queryByText(/^Latest check/)).not.toBeInTheDocument();
  });

  it("lists the defects with their counts, in erp-api's order", async () => {
    const defects = [
      { key: "scratch", name: "Scratch", count: 3 },
      { key: "crack", name: "Crack", count: 1 },
    ];
    renderTab(withStep("finish", { defects }));
    const list = within(await card("Finish")).getByRole("list", { name: "Defects at Finish" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/Scratch\s*3/);
    expect(items[1]).toHaveTextContent(/Crack\s*1/);
  });

  it("shows the latest check, who made it and its photo", async () => {
    renderTab();
    const finalQc = await card("Final QC");
    expect(within(finalQc).getByText("Latest check by Ana Ruiz")).toBeInTheDocument();
    const photo = within(finalQc).getByRole("img", { name: "Latest check at Final QC" });
    await waitFor(() => expect(photo.getAttribute("src")).toMatch(/^https:\/\/storage\.example\.test\//));
  });

  it("names the partner a check was made for", async () => {
    const { latest_check } = group().steps.find((step) => step.key === "final_qc")!;
    renderTab(withStep("final_qc", { latest_check: { ...latest_check!, partner: { id: "p", name: "Northcast Foundry" } } }));
    expect(within(await card("Final QC")).getByText("Latest check by Ana Ruiz at Northcast Foundry")).toBeInTheDocument();
  });

  it("says a sampled step is sampled, with how many were inspected and left out", async () => {
    const sampled = version();
    sampled.steps[1]!.sampling = { inspect: 1, of_every: 3 };
    server.use(http.get(VERSIONS, () => HttpResponse.json(sampled)));
    renderTab(withStep("finish", { passed: 6, failed: 1, not_inspected: 2 }));
    const finish = await card("Finish");
    expect(within(finish).getByText("Sampled: 1 of every 3")).toBeInTheDocument();
    expect(within(finish).getByText("Inspected 5, left out 2")).toBeInTheDocument();
    expect(within(await card("Final QC")).queryByText(/^Sampled|^Inspected/)).not.toBeInTheDocument();
  });

  it("doesn't link the cards anywhere", async () => {
    renderTab();
    await card("Finish");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole("tab", { name: /^Quality/ }));
    expect(await card("Final QC")).toBeInTheDocument();
  });
});
