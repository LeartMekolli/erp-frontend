import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenPieceProvider, useOpenPiece } from "@/components/production/open-piece";
import { useMe } from "@/components/session/session-gate";
import type { Transition, WorkOrderDetail } from "@/lib/api/schema-types";

import { groupIdOf } from "../../../test/fake-erp-api/orders-seed";
import { CLERK, FAKE_API_URL, STAFF, WORKFLOW_READER } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { OrderDetailPage } from "./order-detail-page";
import { StaffPiecePanel as PiecePanel } from "./staff-tabs";

const navigation = vi.hoisted(() => ({ id: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace }),  notFound: vi.fn(),
}));

const GROUP = groupIdOf(1048, 0);
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const orderId = (number: number) => `22222222-0000-4000-8000-${String(number).padStart(12, "0")}`;

function ok<T>(answer: { ok: true; body: T } | { ok: false }): T {
  if (!answer.ok) throw new Error("expected a body");
  return answer.body;
}

/** A piece at the step, by its place in the step's list. */
function pieceAt(stepKey: string, index = 0): string {
  return ok(fakeState().production.pieces(new URLSearchParams({ group_id: GROUP, step_key: stepKey, status: "active" }))).data[index]!.id;
}

const scrappedPiece = () => ok(fakeState().production.pieces(new URLSearchParams({ group_id: GROUP, status: "scrapped" }))).data[0]!.id;

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <OpenPieceProvider>{children}</OpenPieceProvider> : null;
}

/** Which piece the page would show in its panel. */
function OpenId() {
  return <p data-testid="open-piece">{useOpenPiece().id ?? "none"}</p>;
}

function renderPanel(id: string, user = STAFF) {
  const onClose = vi.fn();
  renderAs(
    user,
    <WithMe>
      <PiecePanel id={id} onClose={onClose} />
      <OpenId />
    </WithMe>,
  );
  return onClose;
}

/** Serves this piece as if erp-api had changed it. Other pieces are served as before. */
function serve(id: string, change: (piece: WorkOrderDetail) => WorkOrderDetail) {
  const piece = change(ok(fakeState().production.piece(id)));
  server.use(http.get(`${FAKE_API_URL}/workflow/work-orders/:id`, ({ params }) => (params.id === id ? HttpResponse.json(piece) : undefined)));
}

const REWORK = () => pieceAt("finish", 0);

beforeEach(() => {
  navigation.replace.mockReset();
});

describe("PiecePanel", () => {
  it("names the piece and where it is now", async () => {
    renderPanel(pieceAt("final_qc"));
    expect(await screen.findByRole("dialog", { name: "Piece 7/12" })).toBeInTheDocument();
    expect(screen.getByText("At Final QC")).toBeInTheDocument();
  });

  it("says a piece is being redone when its last move sent it back", async () => {
    renderPanel(REWORK());
    expect(await screen.findByText("Being redone at Finish")).toBeInTheDocument();
  });

  it("says when a piece is scrapped", async () => {
    renderPanel(scrappedPiece());
    await screen.findByRole("dialog", { name: "Piece 12/12" });
    expect(screen.getAllByText("Scrapped").length).toBeGreaterThan(0);
  });

  it("lists every move in order", async () => {
    renderPanel(REWORK());
    const moves = await screen.findByRole("list", { name: "Moves" });
    expect(within(moves).getAllByRole("button").map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false", "true"]);
    const titles = within(moves).getAllByRole("listitem").map((item) => item.textContent);
    expect(titles[0]).toContain("Print passed");
    expect(titles[1]).toContain("Finish passed");
    expect(titles[2]).toContain("Final QC failed");
  });

  it("says when a move cancelled the piece", async () => {
    const id = REWORK();
    serve(id, (piece) => ({
      ...piece,
      status: "cancelled",
      history: [...piece.history, { ...piece.history[0]!, id: "cancel", kind: "correction", to_step: null }],
    }));
    renderPanel(id);
    const button = await screen.findByRole("button", { name: /^Cancelled/ });
    await userEvent.click(button);
    const move = within(button.closest("li")!);
    expect(move.getAllByText("Cancelled")).toHaveLength(2);
    expect(move.queryByText("Finished")).not.toBeInTheDocument();
  });

  it("keeps a pass to one line that opens", async () => {
    renderPanel(REWORK());
    const button = await screen.findByRole("button", { name: /^Print passed/ });
    expect(screen.queryByText("Back to Finish")).toBeInTheDocument();
    expect(within(button.closest("li")!).queryByText("Ana Ruiz")).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(button.closest("li")!).getByText("Ana Ruiz")).toBeInTheDocument();
    expect(within(button.closest("li")!).getByText("On to Finish")).toBeInTheDocument();
  });

  it("opens a failure with what went wrong, what's next and who", async () => {
    renderPanel(REWORK());
    const failure = (await screen.findByRole("button", { name: /^Final QC failed/ })).closest("li")!;
    expect(within(failure).getByText("Porosity")).toBeInTheDocument();
    expect(within(failure).getByText("Surface smooth")).toBeInTheDocument();
    expect(within(failure).getByText("No")).toBeInTheDocument();
    expect(within(failure).getByText("Back to Finish")).toBeInTheDocument();
    expect(within(failure).getByText("Pitted along one edge")).toBeInTheDocument();
    expect(within(failure).getByText("Ana Ruiz")).toBeInTheDocument();
  });

  it("names an answer as the step does, not by its key", async () => {
    const id = REWORK();
    serve(id, (piece) => ({
      ...piece,
      history: piece.history.map((move) =>
        move.kind === "fail" ? { ...move, answers: [{ item: "surface_smooth", label: "Smooth all over", value: "false", value_label: null, note: null, passing: false }] } : move,
      ),
    }));
    renderPanel(id);
    const failure = (await screen.findByRole("button", { name: /^Final QC failed/ })).closest("li")!;
    expect(within(failure).getByText("Smooth all over")).toBeInTheDocument();
    expect(within(failure).queryByText("Surface smooth")).not.toBeInTheDocument();
    expect(within(failure).getByText("No")).toBeInTheDocument();
  });

  it("shows a choice by its option's name, and a free answer as given", async () => {
    const id = REWORK();
    const answers: Transition["answers"] = [
      { item: "surface", label: "Surface", value: "pitted", value_label: "Pitted", note: null, passing: false },
      { item: "depth", label: "Depth", value: "0.4 mm", value_label: null, note: null, passing: true },
    ];
    serve(id, (piece) => ({ ...piece, history: piece.history.map((move) => (move.kind === "fail" ? { ...move, answers } : move)) }));
    renderPanel(id);
    const failure = (await screen.findByRole("button", { name: /^Final QC failed/ })).closest("li")!;
    expect(within(failure).getByText("Pitted")).toBeInTheDocument();
    expect(within(failure).queryByText("pitted")).not.toBeInTheDocument();
    expect(within(failure).getByText("0.4 mm")).toBeInTheDocument();
  });

  it("opens the current step's instructions", async () => {
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    renderPanel(REWORK());
    await userEvent.click(await screen.findByRole("button", { name: "Instructions for Finish" }));
    await waitFor(() => expect(tab.location.href).toMatch(/^https:\/\/storage\.example\.test\//));
    expect(tab.opener).toBeNull();
  });

  it("offers no instructions at a step without them", async () => {
    renderPanel(pieceAt("final_qc"));
    await screen.findByText("At Final QC");
    expect(screen.queryByRole("button", { name: /^Instructions/ })).not.toBeInTheDocument();
  });

  it("offers no instructions without file.read", async () => {
    renderPanel(REWORK(), WORKFLOW_READER);
    await screen.findByText("Being redone at Finish");
    expect(screen.queryByRole("button", { name: /^Instructions/ })).not.toBeInTheDocument();
  });

  it("says when the instructions can't be opened, and stays open", async () => {
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    server.use(
      http.get(`${FAKE_API_URL}/files/:id/versions/:versionId/url`, () =>
        HttpResponse.json({ type: "about:blank", title: "Not Found", status: 404, detail: "File not found" }, { status: 404 }),
      ),
    );
    renderPanel(REWORK());
    await userEvent.click(await screen.findByRole("button", { name: "Instructions for Finish" }));
    expect(await screen.findByText(/File not found/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Piece 3/12" })).toBeInTheDocument();
  });

  it("says why a defect's usual outcome wasn't followed", async () => {
    renderPanel(scrappedPiece());
    const failure = (await screen.findByRole("button", { name: /^Finish failed/ })).closest("li")!;
    expect(within(failure).getByText("Too deep to save")).toBeInTheDocument();
    expect(within(failure).getByText("Scrapped")).toBeInTheDocument();
  });

  it("says when a piece passed without being inspected", async () => {
    const id = pieceAt("final_qc");
    serve(id, (piece) => ({
      ...piece,
      history: piece.history.map((move): Transition => ({ ...move, inspected: false })),
    }));
    renderPanel(id);
    expect(await screen.findByRole("button", { name: /^Print passed, not inspected/ })).toBeInTheDocument();
  });

  it("names the partner a move counted for", async () => {
    const id = pieceAt("final_qc");
    serve(id, (piece) => ({
      ...piece,
      history: piece.history.map((move): Transition => ({ ...move, partner: { id: "p", name: "Northcast Foundry" } })),
    }));
    renderPanel(id);
    await userEvent.click(await screen.findByRole("button", { name: /^Print passed/ }));
    expect(screen.getByText("Ana Ruiz, for Northcast Foundry")).toBeInTheDocument();
  });

  it("opens the piece a replacement replaces", async () => {
    const id = pieceAt("final_qc");
    serve(id, (piece) => ({ ...piece, replaces_id: UNKNOWN_ID }));
    renderPanel(id);
    await userEvent.click(await screen.findByRole("button", { name: "See the piece this replaces" }));
    expect(screen.getByTestId("open-piece")).toHaveTextContent(UNKNOWN_ID);
  });

  it("shows photos through signed links", async () => {
    renderPanel(REWORK());
    const photo = await screen.findByRole("img", { name: "Photo 1 at Final QC" });
    await waitFor(() => expect(photo.getAttribute("src")).toMatch(/^https:\/\/storage\.example\.test\//));
  });

  it("counts photos instead of showing them without file.read", async () => {
    server.use(
      http.get(`${FAKE_API_URL}/workflow/work-orders/:id`, () => HttpResponse.json(ok(fakeState().production.piece(REWORK())))),
    );
    renderPanel(REWORK(), CLERK);
    expect(await screen.findByText("1 photo")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("offers a retry when the piece can't load", async () => {
    server.use(http.get(`${FAKE_API_URL}/workflow/work-orders/:id`, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })));
    renderPanel(REWORK());
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("closes", async () => {
    const onClose = renderPanel(REWORK());
    await screen.findByRole("dialog", { name: "Piece 3/12" });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("the piece panel on the order page", () => {
  function open() {
    navigation.id = orderId(1048);
    renderAs(STAFF, <OrderDetailPage />);
  }

  it("opens a piece's story on the page and closes it, leaving the address alone", async () => {
    open();
    // Print is the first step with pieces, so its list starts open.
    await userEvent.click(await screen.findByRole("button", { name: "History of 1/12" }));
    expect(await screen.findByRole("dialog", { name: "Piece 1/12" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Piece 1/12" })).not.toBeInTheDocument());
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("says when a replaced piece can't be found, and the order still shows", async () => {
    serve(pieceAt("print"), (piece) => ({ ...piece, replaces_id: UNKNOWN_ID }));
    open();
    await userEvent.click(await screen.findByRole("button", { name: "History of 1/12" }));
    await userEvent.click(await screen.findByRole("button", { name: "See the piece this replaces" }));
    expect(await screen.findByText("We couldn't find this piece")).toBeInTheDocument();
    expect(screen.getByText("#1048")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
