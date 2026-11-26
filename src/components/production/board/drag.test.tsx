import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionPage } from "@/components/staff-production/production-page";
import { DRAG_INSTRUCTIONS } from "@/lib/production/board-words";

import { STAFF, WORKFLOW_READER, type FakeUser } from "../../../../test/fake-erp-api/seed";
import { renderAs } from "../../../../test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/production",
  notFound: vi.fn(),
}));

// Dragging is on from 768 px: `wide` stands for the Board's `(min-width: 768px)`.
const media = vi.hoisted(() => ({ wide: true }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => media.wide }));
beforeEach(() => {
  media.wide = true;
});
afterEach(() => {
  media.wide = true;
});

const column = (name: string) => screen.getByRole("region", { name });

async function renderBoard(user: FakeUser = STAFF) {
  renderAs(user, <ProductionPage />);
  await waitFor(() => expect(screen.getByRole("region", { name: "Print" })).toBeInTheDocument());
  // The cards are in, so a missing handle means none, not not yet.
  await within(column("Print")).findByRole("list", { name: "Lines at Print" });
}

describe("Dragging on the Board", () => {
  it("gives each card a drag handle that says how to drag with the keyboard", async () => {
    await renderBoard();
    const handle = await within(column("Print")).findByRole("button", { name: "Drag #1041" });
    const describedBy = handle.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(DRAG_INSTRUCTIONS);
    expect(within(column("Finish")).getByRole("button", { name: "Drag #1048" })).toBeInTheDocument();
  });

  it("gives no handle to a line erp-api holds", async () => {
    await renderBoard();
    await within(column("Print")).findByRole("button", { name: "Drag #1041" });
    expect(within(column("Print")).getByText("Waiting for payment")).toBeInTheDocument();
    expect(within(column("Print")).queryByRole("button", { name: "Drag #1045" })).not.toBeInTheDocument();
  });

  it("gives each piece of an open card its own handle", async () => {
    await renderBoard();
    const print = column("Print");
    await userEvent.click(within(print).getByRole("button", { name: "Pieces of #1041" }));
    const pieces = await within(print).findByRole("list", { name: "Pieces at this step" });
    await waitFor(() => expect(within(pieces).getAllByRole("button", { name: /^Drag piece \d+\/\d+$/ })).toHaveLength(10));
  });

  it("has no handles on a phone, where cards move through Move to…", async () => {
    media.wide = false;
    await renderBoard();
    expect(await within(column("Print")).findByRole("button", { name: "Move #1041…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Drag / })).not.toBeInTheDocument();
  });

  it("has no handles for someone who can't move pieces", async () => {
    await renderBoard(WORKFLOW_READER);
    expect(screen.queryByRole("button", { name: /^Drag / })).not.toBeInTheDocument();
  });
});
