import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { Order } from "@/lib/api/schema-types";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { LinePanel } from "./line-panel";
import { StaffSelectionProvider as StepSelectionProvider } from "./staff-pieces";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <StepSelectionProvider>{children}</StepSelectionProvider> : null;
}

let moves: unknown[] = [];
beforeEach(() => {
  moves = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/reassign")) moves.push(await request.clone().json());
  });
});
afterEach(() => server.events.removeAllListeners());

async function openMove() {
  const parent = order(1048);
  renderAs(
    STAFF,
    <WithMe>
      <LinePanel line={parent.lines[0]!} order={parent} now={Date.now()} index={0} />
    </WithMe>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "Move to another partner" }));
  const open = await screen.findByRole("dialog", { name: "Move 12 × Ring band to another partner" });
  await within(open).findByRole("radio", { name: /Layerline Prints/ });
  return open;
}

const submit = (open: HTMLElement) => userEvent.click(within(open).getByRole("button", { name: "Move job" }));
const choose = (open: HTMLElement) => userEvent.click(within(open).getByRole("radio", { name: /Layerline Prints/ }));

describe("moving a line to another partner", () => {
  it("offers only the other partners, on an accepted line", async () => {
    const open = await openMove();
    expect(within(open).queryByRole("radio", { name: /Northcast Foundry/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw offer" })).not.toBeInTheDocument();
  });

  it("moves the job with nothing owed by default", async () => {
    const open = await openMove();
    await choose(open);
    await submit(open);
    expect(await screen.findByText("Moved to Layerline Prints.")).toBeInTheDocument();
    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toEqual({ partner_id: expect.any(String) });
  });

  it("wants a reason with an amount owed", async () => {
    const open = await openMove();
    await choose(open);
    await userEvent.type(within(open).getByLabelText("Owed to Northcast Foundry (optional)"), "40.00");
    await submit(open);
    expect(await within(open).findByText("Say why they're owed this.")).toBeInTheDocument();
    expect(moves).toHaveLength(0);
    await userEvent.type(within(open).getByLabelText("Reason"), "Half the pieces were cast");
    await submit(open);
    await screen.findByText("Moved to Layerline Prints.");
    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toEqual({ partner_id: expect.any(String), previous_owed: { amount: "40.00", reason: "Half the pieces were cast" } });
  });

  it("refuses an amount that isn't one", async () => {
    const open = await openMove();
    await choose(open);
    await userEvent.type(within(open).getByLabelText("Owed to Northcast Foundry (optional)"), "forty");
    await submit(open);
    expect(await within(open).findByText("Enter an amount such as 40.00.")).toBeInTheDocument();
    expect(moves).toHaveLength(0);
  });

  it("shows erp-api's refusal", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/partners/jobs/:groupId/reassign`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "Every piece is past the payout step: set what each partner is owed instead of moving the job" },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    const open = await openMove();
    await choose(open);
    await submit(open);
    expect(await within(open).findByText(/^Every piece is past the payout step/)).toBeInTheDocument();
  });
});
