import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMe } from "@/components/session/session-gate";
import type { Order } from "@/lib/api/schema-types";
import { formatMoney } from "@/lib/format/money";

import { CLERK, FAKE_API_URL, ORDER_WRITER, STAFF, type FakeUser } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { CancelDialog } from "./cancel-dialog";
import { OrderHeader } from "./order-header";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

function WithMe({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

function renderDialog(parent: Order, user: FakeUser = STAFF) {
  const onCancelled = vi.fn();
  const onOpenChange = vi.fn();
  const rendered = renderAs(
    user,
    <WithMe>
      <CancelDialog order={parent} open onOpenChange={onOpenChange} onCancelled={onCancelled} />
    </WithMe>,
  );
  return { ...rendered, onCancelled, onOpenChange };
}

let sent: unknown[] = [];
beforeEach(() => {
  sent = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/cancel")) sent.push(await request.clone().json());
  });
});
afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

const dialog = (number: number) => screen.findByRole("dialog", { name: `Cancel #${number}` });
const type = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text);
const submit = (name = "Cancel order") => userEvent.click(screen.getByRole("button", { name }));

describe("CancelDialog", () => {
  it("wants a reason", async () => {
    renderDialog(order(1046));
    await dialog(1046);
    await submit();
    expect(await screen.findByText("Say why.")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("asks for no refund on an unpaid order, and cancels it whole", async () => {
    const parent = order(1046);
    const { onCancelled, onOpenChange } = renderDialog(parent);
    await dialog(1046);
    expect(screen.queryByLabelText("Refund")).not.toBeInTheDocument();
    await type("Reason", "Customer changed their mind");
    await submit();
    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith("#1046 cancelled."));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ reason: "Customer changed their mind" });
    expect(order(1046).state).toBe("cancelled");
  });

  it("sends no lines when cancelling the whole of a longer order", async () => {
    renderDialog(order(1049));
    await dialog(1049);
    await type("Reason", "Project dropped");
    await type("Refund", "0.00");
    await submit();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ reason: "Project dropped", refund: { amount: "0.00" } });
  });

  it("sends the positions of the chosen lines", async () => {
    const { onCancelled } = renderDialog(order(1049));
    await dialog(1049);
    await userEvent.click(screen.getByRole("radio", { name: "Some lines" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "8 × Roof truss" }));
    await type("Reason", "Not needed");
    await type("Refund", "10.00");
    await submit("Cancel lines");
    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith("1 line cancelled on #1049."));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ reason: "Not needed", lines: [2], refund: { amount: "10.00" } });
  });

  it("wants a line chosen", async () => {
    renderDialog(order(1049));
    await dialog(1049);
    await userEvent.click(screen.getByRole("radio", { name: "Some lines" }));
    await type("Reason", "Not needed");
    await type("Refund", "0.00");
    await submit("Cancel lines");
    expect(await screen.findByText("Choose at least one line.")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("doesn't offer a line that's already cancelled", async () => {
    const parent = order(1049);
    const lines = parent.lines.map((line, index) => (index === 0 ? { ...line, state: "cancelled" as const } : line));
    renderDialog({ ...parent, lines });
    await dialog(1049);
    await userEvent.click(screen.getByRole("radio", { name: "Some lines" }));
    expect(screen.queryByRole("checkbox", { name: "4 × Facade panel" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "8 × Roof truss" })).toBeInTheDocument();
  });

  it("offers an amount owed on a line a partner accepted, which needs a reason", async () => {
    renderDialog(order(1048));
    await dialog(1048);
    await type("Reason", "Customer changed their mind");
    await type("Refund", "0.00");
    await type("Owed to Northcast Foundry for 12 × Ring band (optional)", "40.00");
    await submit();
    expect(await screen.findByText("Say why they're owed this.")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await type("Why Northcast Foundry is owed this", "Half were cast");
    await submit();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      reason: "Customer changed their mind",
      refund: { amount: "0.00" },
      partner_owed: [{ position: 0, amount: "40.00", reason: "Half were cast" }],
    });
  });

  it("offers no amount owed on a line that's only been offered", async () => {
    renderDialog(order(1049));
    await dialog(1049);
    expect(screen.queryByLabelText(/^Owed to/)).not.toBeInTheDocument();
  });

  it("wants a refund amount on a paid order, within what was paid", async () => {
    const parent = order(1049);
    renderDialog(parent);
    await dialog(1049);
    expect(screen.getByText(`Up to ${formatMoney(parent.total, parent.currency)}. Enter 0.00 to refund nothing.`)).toBeInTheDocument();
    await type("Reason", "Project dropped");
    await submit();
    expect(await screen.findByText("Enter what to refund, or 0.00 for nothing.")).toBeInTheDocument();
    await type("Refund", "9999.00");
    await submit();
    expect(await screen.findByText(`Refund at most ${formatMoney(parent.total, parent.currency)}.`)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("limits the refund to what erp-api says can still be refunded", async () => {
    const paid = order(1049);
    const pending = { ...paid, payment: { ...paid.payment, paid: "500.00", refunded: "0.00", refundable: "200.00" } };
    renderDialog(pending);
    await dialog(1049);
    const most = formatMoney("200.00", paid.currency);
    expect(screen.getByText(`Up to ${most}. Enter 0.00 to refund nothing.`)).toBeInTheDocument();
    await type("Reason", "Project dropped");
    await type("Refund", "300.00");
    await submit();
    expect(await screen.findByText(`Refund at most ${most}.`)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("asks for no refund once nothing is left to refund, even without refund rights", async () => {
    const paid = order(1049);
    const settled = { ...paid, payment: { ...paid.payment, paid: "500.00", refunded: "300.00", refundable: "0.00" } };
    renderDialog(settled, ORDER_WRITER);
    await dialog(1049);
    expect(screen.queryByLabelText("Refund")).not.toBeInTheDocument();
    expect(screen.queryByText(/needs permission to refund/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeEnabled();
  });

  it("says why a paid order can't be cancelled without refund rights", async () => {
    renderDialog(order(1049), ORDER_WRITER);
    await dialog(1049);
    expect(screen.getByText("This order has been paid, and cancelling it needs permission to refund it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeDisabled();
  });

  it("lets someone without refund rights cancel an unpaid order", async () => {
    renderDialog(order(1046), ORDER_WRITER);
    await dialog(1046);
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeEnabled();
  });

  it("shows the refusal for an order that shipped meanwhile, and refreshes", async () => {
    const parent = order(1042);
    const { client, onCancelled } = renderDialog(parent);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await dialog(1042);
    fakeState().orders.ship(parent.id, { courier: "DHL", tracking: "X1" }, null);
    await type("Reason", "Too late");
    await type("Refund", "0.00");
    await submit();
    expect(await screen.findByText("A shipped order can't be cancelled")).toBeInTheDocument();
    expect(onCancelled).not.toHaveBeenCalled();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orders"] }));
  });

  it("puts a refused refund on its field", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/orders/:id/cancel`, () =>
        HttpResponse.json(
          { type: "urn:problem:validation", title: "Validation failed", status: 400, errors: [{ path: "refund.amount", message: "required: up to 10.00" }] },
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderDialog(order(1049));
    await dialog(1049);
    await type("Reason", "Project dropped");
    await type("Refund", "5.00");
    await submit();
    expect(await screen.findByText("required: up to 10.00")).toBeInTheDocument();
  });
});

describe("the header's Cancel action", () => {
  function renderHeader(parent: Order, user: FakeUser = STAFF) {
    const onCancel = vi.fn();
    renderAs(
      user,
      <WithMe>
        <OrderHeader order={parent} onShip={vi.fn()} onRecordPayment={vi.fn()} onCancel={onCancel} />
      </WithMe>,
    );
    return onCancel;
  }

  it("opens from the menu", async () => {
    const onCancel = renderHeader(order(1046));
    await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel order" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("isn't offered without order.write", async () => {
    renderHeader(order(1046), CLERK);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  it.each([1051, 1053, 1054])("isn't offered on order %i, which can't be cancelled", async (number) => {
    renderHeader(order(number));
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(within(heading.closest("header")!).queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });
});
