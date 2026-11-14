import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { useMe } from "@/components/session/session-gate";
import { StaffPhotoLinks } from "@/components/order-detail/staff-tabs";
import type { ActionPiece, LineAction } from "@/lib/api/schema-types";
import type { MoveEntry, StepRules } from "@/lib/production/shape";
import { staffEntry, staffRules } from "@/lib/production/staff";

import { FAKE_API_URL, STAFF, WORKFLOW_READER } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { HistoryEntry } from "./history-entry";

const stepRef = (n: number, key: string, name: string) => ({ id: `b0b0b0b0-0000-4000-8000-00000000000${n}`, key, name });
const PRINT = stepRef(1, "print", "Print");
const FINISH = stepRef(2, "finish", "Finish");
const FINAL_QC = stepRef(3, "final_qc", "Final QC");
const SCRATCH = { id: "b3b3b3b3-0000-4000-8000-000000000001", key: "scratch", name: "Scratch" };
const LENA = { id: "55555555-0000-4000-8000-000000000002", name: "Lena Park" };
const NORTHCAST = { id: "2f1c5d7e-0a9b-4e3c-8d2f-6a5b4c3d2e10", name: "Northcast Foundry" };

const pieceId = (n: number) => `c0c0c0c0-0000-4000-8000-${String(n).padStart(12, "0")}`;

function piece(n: number, fields: Partial<ActionPiece> = {}): ActionPiece {
  return { id: pieceId(n), label: `${n}/10`, replacement: false, from_step: FINISH, to_step: FINAL_QC, status: "active", ...fields };
}

function action(fields: Partial<LineAction> = {}): LineAction {
  return {
    id: "d0d0d0d0-0000-4000-8000-000000000001",
    kind: "pass",
    outcome: null,
    from_step: FINISH,
    to_step: FINAL_QC,
    defect: null,
    override_reason: null,
    comment: null,
    answers: [],
    photos: [],
    actor: LENA,
    partner: NORTHCAST,
    inspected: true,
    created_at: "2026-11-12T14:00:00Z",
    pieces: Array.from({ length: 9 }, (_, index) => piece(index + 1)),
    ...fields,
  };
}

const photo = (n: number) => ({ file_id: `f0f0f0f0-0000-4000-8000-00000000000${n}`, file_version_id: `f1f1f1f1-0000-4000-8000-00000000000${n}` });

const FAIL = action({
  kind: "fail",
  outcome: "scrap",
  to_step: null,
  defect: SCRATCH,
  override_reason: "Too deep to save",
  comment: "Gouged along the band",
  answers: [{ item: "surface_smooth", label: "Surface smooth", value: "false", value_label: null, note: null, passing: false }],
  photos: [photo(1), photo(2)],
  pieces: [piece(4, { to_step: null, status: "scrapped" })],
});

function steps(): StepRules[] {
  const answer = fakeState().production.version("b2b2b2b2-0000-4000-8000-000000000001", 1);
  if (!answer.ok) throw new Error("expected the fake's workflow");
  return answer.body.steps.map((step) => staffRules(step, answer.body.steps));
}

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <StaffPhotoLinks>{children}</StaffPhotoLinks> : null;
}

/** A staff action as erp-api sends it, shown through staff's translation. */
function renderEntry(shown: LineAction, user = STAFF) {
  const entry: MoveEntry = staffEntry(shown);
  renderAs(
    user,
    <WithMe>
      <ol>
        <HistoryEntry action={entry} steps={steps()} />
      </ol>
    </WithMe>,
  );
}

describe("HistoryEntry", () => {
  it("shows a pass as one quiet line", async () => {
    renderEntry(action());
    expect(await screen.findByText("Passed Finish → Final QC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9 pieces" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Lena Park, for Northcast Foundry")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /What came with it/ })).not.toBeInTheDocument();
  });

  it("names a single piece inline", async () => {
    renderEntry(action({ pieces: [piece(4)] }));
    expect(await screen.findByText("piece 4/10")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the pieces as links", async () => {
    renderEntry(action());
    await userEvent.click(await screen.findByRole("button", { name: "9 pieces" }));
    const list = screen.getByRole("list", { name: "Pieces in this move" });
    expect(within(list).getByRole("link", { name: "1/10" })).toHaveAttribute("href", `?piece=${pieceId(1)}`);
    expect(within(list).getAllByRole("link")).toHaveLength(9);
    expect(screen.getByRole("button", { name: "9 pieces" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows a fail with everything that came with it", async () => {
    renderEntry(FAIL);
    expect(await screen.findByText("Failed at Finish: Scratch")).toBeInTheDocument();
    expect(screen.getByText("piece 4/10")).toBeInTheDocument();
    expect(screen.getByText("→ scrapped")).toBeInTheDocument();
    const box = screen.getByRole("group", { name: "What came with it" });
    expect(within(box).getByText("Gouged along the band")).toBeInTheDocument();
    expect(within(box).getByText("Surface smooth")).toBeInTheDocument();
    expect(within(box).getByText("No")).toBeInTheDocument();
    expect(within(box).getByText("Scrapped instead of redone: Too deep to save")).toBeInTheDocument();
    expect(within(box).getByText("Lena Park, for Northcast Foundry")).toBeInTheDocument();
    expect(within(box).getByRole("img", { name: "Photo 1 at Finish" })).toBeInTheDocument();
    expect(within(box).getByText("+1")).toBeInTheDocument();
  });

  it("counts photos without file.read", async () => {
    let asked = false;
    server.use(
      http.get(`${FAKE_API_URL}/files/:id/versions/:versionId/url`, () => {
        asked = true;
        return HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 });
      }),
    );
    renderEntry({ ...FAIL, photos: [photo(1)] }, WORKFLOW_READER);
    expect(await screen.findByText("1 photo")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(asked).toBe(false);
  });

  it("lists each piece's result when they differ", async () => {
    const mixed = action({
      kind: "correction",
      from_step: null,
      to_step: null,
      comment: "Restored after a second look",
      pieces: [piece(4, { from_step: null, to_step: PRINT }), piece(4, { id: pieceId(11), replacement: true, to_step: null, status: "cancelled" })],
    });
    renderEntry(mixed);
    expect(await screen.findByText("Corrected 2 pieces")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "2 pieces" }));
    const items = within(screen.getByRole("list", { name: "Pieces in this move" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["4/10 · At Print", "4/10, replacement · Cancelled"]);
  });

  it("shows a cancel as a quiet line", async () => {
    renderEntry(action({ kind: "correction", to_step: null, pieces: Array.from({ length: 9 }, (_, index) => piece(index + 1, { to_step: null, status: "cancelled" })) }));
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9 pieces" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "What came with it" })).not.toBeInTheDocument();
  });
});
