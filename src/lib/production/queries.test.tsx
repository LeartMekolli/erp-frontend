import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderHookAs, signInAs, testQueryClient } from "../../../test/render";

import type { WorkOrderListItem } from "../api/schema-types";

import {
  fetchLinePieces,
  productionKeys,
  useDefects,
  useMoveActors,
  useMoveList,
  useMovePieces,
  useMoveRows,
  useStepLines,
  useWorkflowCounts,
} from "./queries";

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

describe("History's queries", () => {
  /** The move list's reads, never the moves posted to the same path. */
  let lists: URL[] = [];
  beforeEach(() => {
    lists = [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/workflow/moves") lists.push(url);
    });
  });
  const listReads = () => lists;
  const reads = () => lists.length;

  it("sends exactly the query it is given, 50 moves a page", async () => {
    const query = { workflow_id: WORKFLOW_ID, kind: "fail" as const, from: "2026-11-19T23:00:00.000Z", to: "2026-11-26T23:00:00.000Z" };
    const { result } = renderHookAs(STAFF, () => useMoveList(query));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Object.fromEntries(listReads()[0]!.searchParams)).toEqual({ ...query, limit: "50" });
  });

  it("starts again from the first page, with no cursor, when the filters change after Show more", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/workflow/moves`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json({ data: [], next_cursor: cursor ? null : "moves@50" });
      }),
    );
    let query: { workflow_id: string; kind?: "fail" } = { workflow_id: WORKFLOW_ID };
    const { result, rerender } = renderHookAs(STAFF, () => useMoveList(query));
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await result.current.fetchNextPage();
    expect(listReads().at(-1)!.searchParams.get("cursor")).toBe("moves@50");
    query = { workflow_id: WORKFLOW_ID, kind: "fail" };
    rerender();
    await waitFor(() => expect(listReads().at(-1)!.searchParams.get("kind")).toBe("fail"));
    expect(listReads().at(-1)!.searchParams.has("cursor")).toBe(false);
  });

  it("reads the list again after a move", async () => {
    const query = { workflow_id: WORKFLOW_ID };
    const { result } = renderHookAs(STAFF, () => ({ list: useMoveList(query), move: useMovePieces() }));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const before = reads();
    const id = fakeState().production.pieces(new URLSearchParams({ group_id: GROUP, step_key: "final_qc", status: "active" }));
    if (!id.ok) throw new Error("no piece at Final QC");
    await result.current.move.mutateAsync({ kind: "pass", work_order_ids: [id.body.data[0]!.id], at_step: "final_qc" });
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    await waitFor(() => expect(result.current.list.items[0]?.from_step?.key).toBe("final_qc"));
  });

  it("reads one move's pieces on one line, 200 a page", async () => {
    const { result } = renderHookAs(STAFF, () => useMoveRows("11111111-0000-4000-8000-000000000001", GROUP, true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const asked = urls.find((u) => u.pathname === "/workflow/transitions")!;
    expect(Object.fromEntries(asked.searchParams)).toEqual({ move_id: "11111111-0000-4000-8000-000000000001", group_id: GROUP, limit: "200" });
  });

  it("lists the defects and who has moved pieces of a product type", async () => {
    const { result } = renderHookAs(STAFF, () => ({ defects: useDefects(), people: useMoveActors(WORKFLOW_ID) }));
    await waitFor(() => expect(result.current.people.isSuccess && result.current.defects.isSuccess).toBe(true));
    expect(result.current.defects.data?.map((defect) => defect.key)).toEqual(["crack", "porosity", "scratch"]);
    expect(result.current.people.data?.map((person) => person.name)).toEqual(["Ana Ruiz"]);
    expect(urls.find((u) => u.pathname === "/workflow/moves/actors")!.searchParams.get("workflow_id")).toBe(WORKFLOW_ID);
  });

  it("asks for nobody until a product type is picked", () => {
    const { result } = renderHookAs(STAFF, () => useMoveActors(null));
    expect(result.current.fetchStatus).toBe("idle");
    expect(urls.some((u) => u.pathname === "/workflow/moves/actors")).toBe(false);
  });
});
