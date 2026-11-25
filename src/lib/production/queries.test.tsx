import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderHookAs, signInAs, testQueryClient } from "../../../test/render";

import type { WorkOrderListItem } from "../api/schema-types";

import { fetchLinePieces, productionKeys, useStepLines, useWorkflowCounts } from "./queries";

const WORKFLOW_ID = "b2b2b2b2-0000-4000-8000-000000000001";
const GROUP = groupIdOf(1048, 0);

let urls: URL[] = [];
beforeEach(() => {
  urls = [];
  server.events.on("request:start", ({ request }) => urls.push(new URL(request.url)));
});
afterEach(() => server.events.removeAllListeners());

/** `total` pieces of one line at Finish, served `per` a page as erp-api pages them. */
function manyPieces(total: number, per: number) {
  const answer = fakeState().production.pieces(new URLSearchParams({ group_id: GROUP, step_key: "finish", status: "active" }));
  if (!answer.ok) throw new Error("no seeded piece");
  const template = answer.body.data[0]!;
  const all: WorkOrderListItem[] = Array.from({ length: total }, (_, n) => ({
    ...template,
    id: `d0d0d0d0-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
    number: n + 1,
    label: `${n + 1}/${total}`,
  }));
  server.use(
    http.get(`${FAKE_API_URL}/workflow/work-orders`, ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("cursor") ?? 0);
      return HttpResponse.json({ data: all.slice(offset, offset + per), next_cursor: offset + per < total ? String(offset + per) : null });
    }),
  );
}

describe("production queries", () => {
  it("reads every page of a line's pieces at a step", async () => {
    manyPieces(205, 200);
    signInAs(STAFF);
    const client = testQueryClient();
    const pieces = await fetchLinePieces(client, GROUP, "finish");
    expect(pieces).toHaveLength(205);
    const asked = urls.filter((u) => u.pathname === "/workflow/work-orders");
    expect(asked).toHaveLength(2);
    expect(Object.fromEntries(asked[0]!.searchParams)).toEqual({ group_id: GROUP, step_key: "finish", status: "active", limit: "200" });
    expect(client.getQueryData(productionKeys.pieces(GROUP, "finish", "active"))).toMatchObject({ pages: [{ data: expect.any(Array) }, { data: expect.any(Array) }] });
  });

  it("asks for a step's lines due soonest first, 50 a page", async () => {
    const filter = { workflowId: WORKFLOW_ID, stepKey: "finish", q: null, sort: "due_on" as const, workable: false };
    const { result } = renderHookAs(STAFF, () => useStepLines(filter, true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.items.map((row) => row.group.order?.number)).toEqual([1041, 1048]);
    const asked = urls.find((u) => u.pathname === "/workflow/work-orders/groups")!;
    expect(Object.fromEntries(asked.searchParams)).toEqual({ workflow_id: WORKFLOW_ID, step_key: "finish", sort: "due_on", limit: "50" });
  });

  it("sends workable and the search to the counts", async () => {
    const { result } = renderHookAs(STAFF, () => useWorkflowCounts([WORKFLOW_ID], true, "1041"));
    await waitFor(() => expect(result.current[0]?.isSuccess).toBe(true));
    const asked = urls.find((u) => u.pathname === "/workflow/work-orders/counts")!;
    expect(Object.fromEntries(asked.searchParams)).toEqual({ workflow_id: WORKFLOW_ID, workable: "true", q: "1041" });
    expect(result.current[0]!.data?.steps.map((step) => step.key)).toEqual(["print", "finish", "final_qc", "packing"]);
  });
});
