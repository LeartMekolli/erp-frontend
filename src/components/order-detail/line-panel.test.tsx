import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { Order } from "@/lib/api/schema-types";

import { CLERK, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { LinePanel } from "./line-panel";
import { StaffSelectionProvider as StepSelectionProvider } from "./staff-pieces";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

/** As under SessionGate: nothing renders until `/me` has loaded. */
function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <StepSelectionProvider>{children}</StepSelectionProvider> : null;
}

function renderLine(number: number, position = 0, user = STAFF) {
  const parent = order(number);
  return renderAs(
    user,
    <WithMe>
      <LinePanel line={parent.lines[position]!} order={parent} now={Date.now()} index={position} />
    </WithMe>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("LinePanel", () => {
  it("says what the line was made with", async () => {
    renderLine(1048);
    const panel = await screen.findByRole("region", { name: "12 × Ring band" });
    expect(within(panel).getByText("Brass")).toBeInTheDocument();
    expect(within(panel).getByText("52")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Ring band.stl" })).toBeInTheDocument();
  });

  it("opens the design file through a signed link", async () => {
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    renderLine(1048);
    await userEvent.click(await screen.findByRole("button", { name: "Ring band.stl" }));
    await waitFor(() => expect(tab.location.href).toMatch(/^https:\/\/storage\.example\.test\//));
    expect(tab.opener).toBeNull();
  });

  it("names the file without a link when it can't be read", async () => {
    renderLine(1048, 0, CLERK);
    expect(await screen.findByText("Ring band.stl")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ring band.stl" })).not.toBeInTheDocument();
  });

  it("says who has the line", async () => {
    renderLine(1048);
    expect(await screen.findByText("Northcast Foundry")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("shows an open offer with its deadline", async () => {
    renderLine(1049, 0);
    expect(await screen.findByText(/^Offered, answer by /)).toBeInTheDocument();
  });

  it("shows an offer past its deadline as expired", async () => {
    renderLine(1049, 1);
    expect(await screen.findByText("Offer expired")).toBeInTheDocument();
    expect(screen.queryByText(/answer by/)).not.toBeInTheDocument();
  });

  it("says in-house when no partner has it", async () => {
    renderLine(1049, 2);
    expect(await screen.findByText("In-house")).toBeInTheDocument();
  });

  it("marks a cancelled line and leaves out who has it", async () => {
    renderLine(1054);
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("In-house")).not.toBeInTheDocument();
  });

  it("lists an assembly's parts with their own picks", async () => {
    renderLine(1045);
    const shell = await screen.findByRole("region", { name: "1 × Housing shell" });
    expect(within(shell).getByRole("heading", { level: 3 })).toHaveTextContent("1 × Housing shell");
    expect(within(shell).getByRole("button", { name: "Housing shell.stl" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "1 × Housing lid" })).toBeInTheDocument();
  });
});
