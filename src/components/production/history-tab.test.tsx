import { screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { StaffPhotoLinks } from "@/components/order-detail/staff-tabs";
import { useMe } from "@/components/session/session-gate";
import type { LineAction } from "@/lib/api/schema-types";
import type { MoveEntry } from "@/lib/production/shape";
import { staffEntry } from "@/lib/production/staff";

import { STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { HistoryTab } from "./history-tab";

const NOW = Date.parse("2026-11-12T15:00:00Z");
const FINISH = { id: "b0b0b0b0-0000-4000-8000-000000000002", key: "finish", name: "Finish" };
const FINAL_QC = { id: "b0b0b0b0-0000-4000-8000-000000000003", key: "final_qc", name: "Final QC" };

function pass(n: number, created_at: string): MoveEntry {
  const action: LineAction = {
    id: `d0d0d0d0-0000-4000-8000-00000000000${n}`,
    kind: "pass",
    outcome: null,
    from_step: FINISH,
    to_step: FINAL_QC,
    defect: null,
    override_reason: null,
    comment: null,
    answers: [],
    photos: [],
    actor: { id: "55555555-0000-4000-8000-000000000001", name: "Ana Ruiz" },
    partner: null,
    inspected: true,
    created_at,
    pieces: [{ id: `c0c0c0c0-0000-4000-8000-00000000000${n}`, label: `${n}/10`, replacement: false, from_step: FINISH, to_step: FINAL_QC, status: "active" }],
  };
  return staffEntry(action);
}

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <StaffPhotoLinks>{children}</StaffPhotoLinks> : null;
}

function renderHistory(items: MoveEntry[], cameAt: string | null, hasNextPage = false) {
  const list = {
    items,
    data: {},
    isPending: false,
    error: null,
    refetch: () => undefined,
    dataUpdatedAt: NOW,
    hasNextPage,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    pageCount: 1,
    fetchNextPage: () => undefined,
  };
  renderAs(
    STAFF,
    <WithMe>
      <HistoryTab
        list={list}
        counts={null}
        filter="all"
        onFilter={() => undefined}
        rules={{ data: [], isPending: false, error: null, refetch: () => undefined }}
        cameAt={cameAt}
        of="job"
      />
    </WithMe>,
  );
}

const rows = (list: HTMLElement) => within(list).getAllByRole("listitem").map((item) => item.textContent ?? "");

describe("HistoryTab", () => {
  it("marks when the job came", async () => {
    renderHistory([pass(2, "2026-11-12T14:00:00Z"), pass(1, "2026-11-12T09:00:00Z")], "2026-11-12T11:00:00Z");
    const today = await screen.findByRole("list", { name: "Moves on Today" });
    const shown = rows(today);
    expect(shown).toHaveLength(3);
    expect(shown[0]).toContain("piece 2/10");
    expect(shown[1]).toContain("Came to you");
    expect(shown[2]).toContain("piece 1/10");
  });

  it("puts the mark under the day it fell on", async () => {
    renderHistory([pass(2, "2026-11-12T14:00:00Z"), pass(1, "2026-11-10T09:00:00Z")], "2026-11-11T12:00:00Z");
    const yesterday = await screen.findByRole("list", { name: "Moves on Yesterday, 11 Nov" });
    expect(rows(yesterday)).toEqual([expect.stringContaining("Came to you")]);
  });

  it("waits for older moves before marking a job that came before them all", async () => {
    renderHistory([pass(1, "2026-11-12T14:00:00Z")], "2026-11-12T08:00:00Z", true);
    await screen.findByRole("list", { name: "Moves on Today" });
    expect(screen.queryByText("Came to you")).not.toBeInTheDocument();
  });

  it("shows no mark on staff's line", async () => {
    renderHistory([pass(1, "2026-11-12T14:00:00Z")], null);
    await screen.findByRole("list", { name: "Moves on Today" });
    expect(screen.queryByText("Came to you")).not.toBeInTheDocument();
  });
});
