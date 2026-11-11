import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { Order } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";

import { FAKE_API_URL, STAFF, WORKFLOW_READER, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { LinePanel } from "./line-panel";
import { StepSelectionProvider } from "./use-step-selection";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? <StepSelectionProvider>{children}</StepSelectionProvider> : null;
}

function renderLine(parent: Order, position: number, user: FakeUser = STAFF) {
  renderAs(
    user,
    <WithMe>
      <p>Signed in</p>
      <LinePanel line={parent.lines[position]!} order={parent} now={Date.now()} index={position} />
    </WithMe>,
  );
}

let offers: { url: string; body: unknown }[] = [];
beforeEach(() => {
  offers = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && /\/partners\/jobs\//.test(request.url)) {
      offers.push({ url: request.url, body: await request.clone().text().then((text) => (text ? JSON.parse(text) : null)) });
    }
  });
});
afterEach(() => server.events.removeAllListeners());

const button = (name: string) => screen.findByRole("button", { name });
const openSend = async () => userEvent.click(await button("Send to partner"));
const dialog = () => screen.findByRole("dialog", { name: "Send 8 × Roof truss to a partner" });

describe("sending a line to a partner", () => {
  it("lists who can take it first, with cost, margin and room, then who can't and why", async () => {
    renderLine(order(1049), 2);
    await openSend();
    const open = await dialog();
    const northcast = await within(open).findByRole("radio", { name: /Northcast Foundry/ });
    expect(within(open).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toHaveLength(2);
    expect(northcast.closest("label")).toHaveTextContent(`Costs ${formatMoney("120.00", "EUR")}`);
    expect(northcast.closest("label")).toHaveTextContent(`Margin ${formatMoney("80.00", "EUR")}`);
    expect(northcast.closest("label")).toHaveTextContent("Room for 40 more");
    expect(northcast.closest("label")).toHaveTextContent("Score 4.6");
    expect(within(open).getByRole("radio", { name: /Layerline Prints/ }).closest("label")).toHaveTextContent("Room for 3 more");
    expect(within(open).getByRole("radio", { name: /Layerline Prints/ }).closest("label")).toHaveTextContent("New");
    expect(within(open).getByText("Ember Casting")).toBeInTheDocument();
    expect(within(open).getByText("Doesn't make this material. No room this week.")).toBeInTheDocument();
    expect(within(open).queryByRole("radio", { name: /Ember Casting/ })).not.toBeInTheDocument();
  });

  it("wants a partner chosen", async () => {
    renderLine(order(1049), 2);
    await openSend();
    const open = await dialog();
    await within(open).findByRole("radio", { name: /Layerline Prints/ });
    await userEvent.click(within(open).getByRole("button", { name: "Send offer" }));
    expect(await within(open).findByText("Choose a partner.")).toBeInTheDocument();
    expect(offers).toHaveLength(0);
  });

  it("sends the partner and the due date", async () => {
    const parent = order(1049);
    renderLine(parent, 2);
    await openSend();
    const open = await dialog();
    await userEvent.click(await within(open).findByRole("radio", { name: /Layerline Prints/ }));
    await userEvent.type(within(open).getByLabelText("Due by (optional)"), "2030-01-15");
    await userEvent.click(within(open).getByRole("button", { name: "Send offer" }));
    expect(await screen.findByText("Offered to Layerline Prints.")).toBeInTheDocument();
    await waitFor(() => expect(offers).toHaveLength(1));
    expect(offers[0]!.url).toContain(`/partners/jobs/${parent.lines[2]!.group_id}/offer`);
    expect(offers[0]!.body).toEqual({ partner_id: expect.any(String), due_on: "2030-01-15" });
  });

  it("leaves the due date to erp-api when none is given", async () => {
    renderLine(order(1049), 2);
    await openSend();
    const open = await dialog();
    await userEvent.click(await within(open).findByRole("radio", { name: /Layerline Prints/ }));
    await userEvent.click(within(open).getByRole("button", { name: "Send offer" }));
    await screen.findByText("Offered to Layerline Prints.");
    await waitFor(() => expect(offers).toHaveLength(1));
    expect(offers[0]!.body).toEqual({ partner_id: expect.any(String) });
  });

  it("shows erp-api's refusal when an order's lines must stay with one partner", async () => {
    renderLine(order(1049), 2);
    await openSend();
    const open = await dialog();
    await userEvent.click(await within(open).findByRole("radio", { name: /Northcast Foundry/ }));
    await userEvent.click(within(open).getByRole("button", { name: "Send offer" }));
    expect(await within(open).findByText("Every line of this order goes to one partner")).toBeInTheDocument();
  });

  it("says when nobody can take it", async () => {
    server.use(http.get(`${FAKE_API_URL}/partners/eligible`, () => HttpResponse.json({ data: [], ineligible: [] })));
    renderLine(order(1049), 2);
    await openSend();
    const open = await dialog();
    expect(await within(open).findByText("No partner can take this job right now.")).toBeInTheDocument();
    expect(within(open).getByRole("button", { name: "Send offer" })).toBeDisabled();
  });

  it("offers a retry when the partners can't load", async () => {
    server.use(http.get(`${FAKE_API_URL}/partners/eligible`, () => HttpResponse.json({ type: "about:blank", title: "Error", status: 500 }, { status: 500 })));
    renderLine(order(1049), 2);
    await openSend();
    const open = await dialog();
    expect(await within(open).findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("the line's partner actions", () => {
  it("offers only Withdraw on an open offer, and withdraws it", async () => {
    const parent = order(1049);
    renderLine(parent, 0);
    await userEvent.click(await button("Withdraw offer"));
    expect(await screen.findByText("Offer withdrawn.")).toBeInTheDocument();
    await waitFor(() => expect(offers).toHaveLength(1));
    expect(offers[0]!.url).toContain(`/partners/jobs/${parent.lines[0]!.group_id}/withdraw`);
    expect(screen.queryByRole("button", { name: "Send to partner" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to another partner" })).not.toBeInTheDocument();
  });

  it("offers Send again once an offer has run out", async () => {
    renderLine(order(1049), 1);
    expect(await button("Send to partner")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Withdraw offer" })).not.toBeInTheDocument();
  });

  it("offers no actions without partner.assign", async () => {
    renderLine(order(1049), 2, WORKFLOW_READER);
    await screen.findByText("Signed in");
    expect(screen.queryByRole("button", { name: "Send to partner" })).not.toBeInTheDocument();
  });

  it.each(["shipped", "delivered", "cancelled"] as const)("offers no actions on a %s order", async (state) => {
    renderLine({ ...order(1049), state }, 2);
    await screen.findByText("Signed in");
    await screen.findByText("In-house");
    expect(screen.queryByRole("button", { name: "Send to partner" })).not.toBeInTheDocument();
  });

  it("disables Send and says why on an order waiting for payment", async () => {
    renderLine({ ...order(1049), state: "awaiting_payment" }, 2);
    expect(await button("Send to partner")).toBeDisabled();
    expect(screen.getByText("The order is waiting for payment")).toBeInTheDocument();
  });

  it("offers no partner for an assembly, which is put together in-house", async () => {
    renderLine(order(1045), 0);
    await screen.findByRole("region", { name: "1 × Housing lid" });
    expect(screen.queryByRole("button", { name: "Send to partner" })).not.toBeInTheDocument();
  });
});
