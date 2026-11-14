import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNKNOWN } from "@/components/auth/copy";
import { LineTabs } from "@/components/order-detail/line-tabs";
import { StaffSelectionProvider } from "@/components/order-detail/staff-pieces";
import { useMe } from "@/components/session/session-gate";
import type { Group, MoveBody } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { useMovePieces } from "@/lib/production/queries";
import { nextStepName } from "@/lib/production/selection";
import type { NextStep, Piece, StepRules } from "@/lib/production/shape";
import { staffPiece, staffRules } from "@/lib/production/staff";
import type { UploadTarget } from "@/lib/upload/upload";

import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { FAKE_API_URL, NORTHCAST_ID, PARTNER, STAFF, WORKFLOW_READER, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { MoveDialog } from "./move-dialog";

const GROUP = groupIdOf(1048, 0);
const MOVES = `${FAKE_API_URL}/workflow/moves`;
const STAFF_PHOTOS: UploadTarget = { area: "staff", kind: "image" };

function ok<T>(answer: { ok: true; body: T } | { ok: false }): T {
  if (!answer.ok) throw new Error("expected a body");
  return answer.body;
}

const group = (): Group => ok(fakeState().production.group(GROUP));
const stepAt = (key: string): StepRules => {
  const { workflow, steps } = group();
  const step = ok(fakeState().production.version(workflow.id, workflow.version)).steps.find((candidate) => candidate.key === key)!;
  return staffRules(step, steps);
};
const piecesAt = (key: string): Piece[] =>
  ok(fakeState().production.pieces(new URLSearchParams({ group_id: GROUP, step_key: key, status: "active" }))).data.map(staffPiece);
const nextAfter = (key: string): NextStep => {
  const name = nextStepName(group().steps, key);
  return name ? { name } : null;
};

let sent: { body: MoveBody; key: string | null }[] = [];
let requested: string[] = [];
beforeEach(() => {
  sent = [];
  requested = [];
  server.events.on("request:start", async ({ request }) => {
    requested.push(`${request.method} ${new URL(request.url).pathname}`);
    if (request.method === "POST" && request.url === MOVES) {
      sent.push({ body: (await request.clone().json()) as MoveBody, key: request.headers.get("idempotency-key") });
    }
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <StaffSelectionProvider>{children}</StaffSelectionProvider> : null;
}

interface DialogOptions {
  kind: "pass" | "fail" | "correction";
  step: StepRules;
  pieces?: Piece[];
  next?: NextStep;
  countsFor?: string | null;
  uploadTarget?: UploadTarget;
  user?: FakeUser;
}

/** The dialog as staff's Pieces tab opens it: moves go through staff's mutation, uploads follow `file.write`. */
function StaffDialog({ options, pieces, onMoved, onOpenChange }: { options: DialogOptions; pieces: Piece[]; onMoved: () => void; onOpenChange: () => void }) {
  const move = useMovePieces();
  const mayUpload = useCan("file.write");
  return (
    <MoveDialog
      kind={options.kind}
      rules={options.step}
      path={group().steps}
      next={options.next === undefined ? nextAfter(options.step.key) : options.next}
      pieces={pieces}
      mayUpload={options.uploadTarget?.area === "partner" || mayUpload}
      uploadTarget={options.uploadTarget ?? STAFF_PHOTOS}
      countsFor={options.countsFor ?? null}
      onMove={async (body) => {
        await move.mutateAsync(body);
      }}
      open
      onOpenChange={onOpenChange}
      onMoved={onMoved}
    />
  );
}

function renderDialog(options: DialogOptions) {
  const onMoved = vi.fn();
  const onOpenChange = vi.fn();
  const pieces = options.pieces ?? piecesAt(options.step.key).slice(0, 2);
  renderAs(
    options.user ?? STAFF,
    <WithMe>
      <StaffDialog options={options} pieces={pieces} onMoved={onMoved} onOpenChange={onOpenChange} />
    </WithMe>,
  );
  return { onMoved, onOpenChange, pieces };
}

const click = (name: string) => userEvent.click(screen.getByRole("button", { name }));
const dialog = (name: string) => screen.findByRole("dialog", { name });
const withoutPhotos = (step: StepRules): StepRules => ({ ...step, pass: { ...step.pass, minPhotos: 0 } });
const answerYes = () => userEvent.click(within(screen.getByRole("group", { name: "Surface smooth" })).getByRole("radio", { name: "Yes" }));

describe("MoveDialog: pass", () => {
  it("confirms a step with no checks and moves the pieces", async () => {
    const { onMoved, onOpenChange, pieces } = renderDialog({ kind: "pass", step: stepAt("print") });
    await dialog("Pass 2 pieces at Print");
    await click("Pass to Finish");
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith("2 pieces passed to Finish."));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ kind: "pass", work_order_ids: pieces.map((piece) => piece.id), at_step: "print" });
    expect(sent[0]!.key).toBeTruthy();
  });

  it("sends the step, the answers and the photos", async () => {
    const { onMoved } = renderDialog({ kind: "pass", step: stepAt("finish") });
    await dialog("Pass 2 pieces at Finish");
    await answerYes();
    await userEvent.upload(screen.getByLabelText("Photos"), new File(["x"], "photo.jpg", { type: "image/jpeg" }));
    await screen.findByRole("button", { name: "Remove photo.jpg" }, { timeout: 4_000 });
    await click("Pass to Final QC");
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({
      at_step: "finish",
      answers: [{ item: "surface_smooth", value: true }],
      photo_file_version_ids: [expect.any(String)],
    });
  });

  it("wants the required answers before sending anything", async () => {
    renderDialog({ kind: "pass", step: withoutPhotos(stepAt("finish")) });
    await dialog("Pass 2 pieces at Finish");
    await click("Pass to Final QC");
    expect(await screen.findByText("Answer this.")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("wants the photos the step asks for", async () => {
    renderDialog({ kind: "pass", step: stepAt("finish") });
    await dialog("Pass 2 pieces at Finish");
    await answerYes();
    await click("Pass to Final QC");
    expect(await screen.findByText("Add at least 1 photo.")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("puts erp-api's refusal on the field it names", async () => {
    server.use(
      http.post(MOVES, () =>
        HttpResponse.json(
          { type: "urn:problem:validation", title: "Validation failed", status: 400, errors: [{ path: "surface_smooth", message: "Surface smooth does not pass its check" }] },
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderDialog({ kind: "pass", step: withoutPhotos(stepAt("finish")) });
    await dialog("Pass 2 pieces at Finish");
    await answerYes();
    await click("Pass to Final QC");
    const group = await screen.findByRole("group", { name: "Surface smooth" });
    expect(await within(group).findByText("Surface smooth does not pass its check")).toBeInTheDocument();
  });

  it("says why a step needing photos can't be passed without upload rights", async () => {
    renderDialog({ kind: "pass", step: stepAt("finish"), user: WORKFLOW_READER });
    await dialog("Pass 2 pieces at Finish");
    expect(screen.getByText("This step needs photos, and you don't have permission to add them.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pass to Final QC" })).toBeDisabled();
    expect(screen.queryByLabelText("Photos")).not.toBeInTheDocument();
  });

  it("says Finish at the last step", async () => {
    const { onMoved } = renderDialog({ kind: "pass", step: stepAt("packing") });
    await dialog("Finish 1 piece at Packing");
    await click("Finish");
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith("1 piece finished."));
  });

  it("offers Pass without inspecting only when every piece may skip", async () => {
    server.use(http.post(MOVES, () => HttpResponse.json({ data: [] })));
    const step = stepAt("finish");
    const skippable = piecesAt("finish").slice(0, 2).map((piece) => ({ ...piece, toInspect: false }));
    const { onMoved } = renderDialog({ kind: "pass", step, pieces: skippable });
    await dialog("Pass 2 pieces at Finish");
    await click("Pass without inspecting");
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ kind: "pass", work_order_ids: skippable.map((piece) => piece.id), at_step: "finish", inspected: false });
  });

  it("hides Pass without inspecting when a piece must be inspected", async () => {
    const step = stepAt("finish");
    const [first, second] = piecesAt("finish");
    renderDialog({ kind: "pass", step, pieces: [{ ...first!, toInspect: false }, { ...second!, toInspect: true }] });
    await dialog("Pass 2 pieces at Finish");
    expect(screen.queryByRole("button", { name: "Pass without inspecting" })).not.toBeInTheDocument();
  });

  it("says whose work a partner step counts as", async () => {
    renderDialog({ kind: "pass", step: stepAt("finish"), countsFor: "Northcast Foundry" });
    await dialog("Pass 2 pieces at Finish");
    expect(screen.getByText("This counts for Northcast Foundry")).toBeInTheDocument();
  });

  it("says where a pass goes when it isn't known", async () => {
    // The fake still wants Finish's photo; this test is about the words.
    server.use(http.post(MOVES, () => HttpResponse.json({ data: [] })));
    const pieces = piecesAt("finish").slice(0, 3);
    const { onMoved } = renderDialog({ kind: "pass", step: withoutPhotos(stepAt("finish")), pieces, next: "unknown" });
    await dialog("Pass 3 pieces at Finish");
    await answerYes();
    await click("Pass");
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith("3 pieces passed at Finish."));
  });

  it("uploads photos where it's told", async () => {
    renderDialog({ kind: "pass", step: stepAt("finish"), user: PARTNER, uploadTarget: { area: "partner", partnerId: NORTHCAST_ID } });
    await dialog("Pass 2 pieces at Finish");
    await userEvent.upload(screen.getByLabelText("Photos"), new File(["x"], "photo.jpg", { type: "image/jpeg" }));
    await screen.findByRole("button", { name: "Remove photo.jpg" }, { timeout: 4_000 });
    expect(requested).toContain(`POST /partner-portal/partners/${NORTHCAST_ID}/files`);
    expect(requested).not.toContain("POST /files");
  });

  it("reuses the key when the same move is sent again after a failure", async () => {
    server.use(http.post(MOVES, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 }), { once: true }));
    const { onMoved } = renderDialog({ kind: "pass", step: stepAt("print") });
    await dialog("Pass 2 pieces at Print");
    await click("Pass to Finish");
    expect(await screen.findByText(UNKNOWN)).toBeInTheDocument();
    await click("Pass to Finish");
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]!.key).toBe(sent[1]!.key);
  });

  it("names the pieces a 409 lists", async () => {
    server.use(
      http.post(MOVES, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "Some pieces cannot make this move", errors: [{ path: "work_order_ids.0", message: "1/12 is at Finish" }] },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    const { onMoved } = renderDialog({ kind: "pass", step: stepAt("print") });
    await dialog("Pass 2 pieces at Print");
    await click("Pass to Finish");
    expect(await screen.findByText("Some pieces cannot make this move 1/12 is at Finish")).toBeInTheDocument();
    expect(onMoved).not.toHaveBeenCalled();
  });
});

describe("MoveDialog: fail", () => {
  it("wants a defect and the comment the step asks for", async () => {
    renderDialog({ kind: "fail", step: stepAt("final_qc") });
    await dialog("Fail 2 pieces at Final QC");
    await click("Fail");
    expect(await screen.findByText("Choose a defect.")).toBeInTheDocument();
    expect(screen.getByText("Add a comment.")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("shows the defect's default outcome and follows it", async () => {
    const step = stepAt("final_qc");
    const { onMoved } = renderDialog({ kind: "fail", step });
    await dialog("Fail 2 pieces at Final QC");
    await userEvent.selectOptions(screen.getByLabelText("Defect"), "Porosity");
    expect(screen.getByText("Goes back to Finish to be redone")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Comment"), "Pitted");
    await click("Fail");
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith("2 pieces failed at Final QC."));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({ kind: "fail", at_step: "final_qc", defect_id: step.defects[0]!.id, comment: "Pitted" });
    expect(sent[0]!.body).not.toHaveProperty("outcome");
  });

  it("wants a reason to change the outcome", async () => {
    const { onMoved } = renderDialog({ kind: "fail", step: stepAt("final_qc") });
    await dialog("Fail 2 pieces at Final QC");
    await userEvent.selectOptions(screen.getByLabelText("Defect"), "Porosity");
    await userEvent.type(screen.getByLabelText("Comment"), "Pitted");
    await click("Change what happens");
    await userEvent.selectOptions(screen.getByLabelText("What should happen"), "Scrap the pieces");
    await click("Fail");
    expect(await screen.findByText("Say why this differs from the usual outcome.")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await userEvent.type(screen.getByLabelText("Reason"), "Too deep to save");
    await click("Fail");
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({ outcome: "scrap", override_reason: "Too deep to save" });
  });

  it("says when a step has no defects to fail with", async () => {
    renderDialog({ kind: "fail", step: stepAt("print") });
    await dialog("Fail 2 pieces at Print");
    expect(screen.getByText("This step has no defects set up, so pieces can't be failed here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fail" })).toBeDisabled();
  });
});

describe("MoveDialog: correction", () => {
  it("needs a step and a comment", async () => {
    const { onMoved, pieces } = renderDialog({ kind: "correction", step: stepAt("packing"), pieces: piecesAt("packing") });
    await dialog("Correct 1 piece at Packing");
    await click("Correct");
    expect(await screen.findByText("Choose a step.")).toBeInTheDocument();
    expect(screen.getByText("Say why.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Put them at"), "Print");
    await userEvent.type(screen.getByLabelText("Comment"), "Moved by mistake");
    await click("Correct");
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith("1 piece corrected."));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ kind: "correction", work_order_ids: pieces.map((piece) => piece.id), to_step: "print", comment: "Moved by mistake" });
  });

  it("doesn't offer the step the pieces are already at", async () => {
    renderDialog({ kind: "correction", step: stepAt("packing"), pieces: piecesAt("packing") });
    await dialog("Correct 1 piece at Packing");
    expect(within(screen.getByLabelText("Put them at")).queryByRole("option", { name: "Packing" })).not.toBeInTheDocument();
  });
});

describe("moving from the order page", () => {
  function renderPieces(partnerName: string | null = null) {
    return renderAs(
      STAFF,
      <WithMe>
        <LineTabs groupId={GROUP} index={0} orderState="in_production" partnerName={partnerName} />
      </WithMe>,
    );
  }

  const tick = async (name: string) => userEvent.click(await screen.findByRole("checkbox", { name }));

  async function openPass(name: string) {
    const button = await screen.findByRole("button", { name });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
  }

  it("moves the picked pieces, clears them and refreshes the line", async () => {
    renderPieces();
    await tick("Select all at Print");
    await openPass("Pass to Finish");
    const open = await dialog("Pass 2 pieces at Print");
    await userEvent.click(within(open).getByRole("button", { name: "Pass to Finish" }));
    expect(await screen.findByText("2 pieces passed to Finish.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Selected pieces" })).not.toBeInTheDocument();
    const strip = await screen.findByRole("list", { name: "Progress through the steps" });
    await waitFor(() => expect(within(strip).getAllByRole("listitem")[0]).toHaveTextContent("0 Print"));
  });

  it("doesn't call a person's own move someone else's while the page refreshes", async () => {
    renderPieces();
    await tick("Select all at Print");
    await openPass("Pass to Finish");
    const open = await dialog("Pass 2 pieces at Print");
    server.use(http.get(`${FAKE_API_URL}/workflow/groups/:id`, () => delay("infinite")));
    await userEvent.click(within(open).getByRole("button", { name: "Pass to Finish" }));
    expect(await screen.findByText("2 pieces passed to Finish.")).toBeInTheDocument();
    expect(screen.queryByText(/left your selection/)).not.toBeInTheDocument();
  });

  it("shows a 409's detail, refreshes and drops the piece someone else moved", async () => {
    renderPieces();
    await tick("Select 1/12");
    await tick("Select 2/12");
    await openPass("Pass to Finish");
    const open = await dialog("Pass 2 pieces at Print");
    fakeState().production.move({ kind: "pass", work_order_ids: [piecesAt("print")[0]!.id], at_step: "print" }, null);
    await userEvent.click(within(open).getByRole("button", { name: "Pass to Finish" }));
    expect(await screen.findByText("Some pieces cannot make this move")).toBeInTheDocument();
    expect(await screen.findByText("1 piece moved on and left your selection.")).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Pass 1 piece at Print" })).toBeInTheDocument();
  });

  it("says a partner's step counts for the partner, and an in-house step doesn't", async () => {
    renderPieces("Northcast Foundry");
    await userEvent.click(await screen.findByRole("button", { name: /^Finish\b/ }));
    await tick("Select 3/12");
    await openPass("Pass to Final QC");
    await dialog("Pass 1 piece at Finish");
    expect(screen.getByText("This counts for Northcast Foundry")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await tick("Select 1/12");
    await openPass("Pass to Finish");
    await dialog("Pass 1 piece at Print");
    expect(screen.queryByText("This counts for Northcast Foundry")).not.toBeInTheDocument();
  });
});
