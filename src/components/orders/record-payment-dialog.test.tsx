import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/schema-types";
import { addDays, workspaceToday } from "@/lib/orders/labels";

import { STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { RecordPaymentDialog } from "./record-payment-dialog";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

let paymentRequests: (string | null)[] = [];
beforeEach(() => {
  paymentRequests = [];
  server.events.on("request:start", ({ request }) => {
    if (request.url.endsWith("/paid-by-hand")) paymentRequests.push(request.headers.get("idempotency-key"));
  });
});
afterEach(() => server.events.removeAllListeners());

function renderDialog(number: number) {
  const onOpenChange = vi.fn();
  const onRecorded = vi.fn();
  const rendered = renderAs(
    STAFF,
    <RecordPaymentDialog order={order(number)} open onOpenChange={onOpenChange} onRecorded={onRecorded} />,
  );
  return { ...rendered, onOpenChange, onRecorded };
}

describe("RecordPaymentDialog", () => {
  it("records a payment and refreshes the list", async () => {
    const { client, onOpenChange, onRecorded } = renderDialog(1045);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const dialog = await screen.findByRole("dialog", { name: "Record a payment for #1045" });
    expect(within(dialog).getByLabelText("Received on")).toHaveValue(workspaceToday("UTC"));
    expect(within(dialog).getByText("Such as the bank transfer reference")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Reference"), "TRX-2207");
    await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));

    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith("Payment recorded for #1045."));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(order(1045).payment.state).toBe("paid");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orders"] });
  });

  it("asks for a reference", async () => {
    renderDialog(1045);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
    expect(await within(dialog).findByText("Enter a reference.")).toBeInTheDocument();
    expect(paymentRequests).toHaveLength(0);
  });

  it("refuses a received day after today in the workspace zone", async () => {
    renderDialog(1045);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Received on")).toHaveAttribute("max", workspaceToday("UTC"));
    await userEvent.type(within(dialog).getByLabelText("Reference"), "TRX-2207");
    const received = within(dialog).getByLabelText("Received on");
    await userEvent.clear(received);
    await userEvent.type(received, addDays(workspaceToday("UTC"), 1));
    await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
    expect(await within(dialog).findByText("Pick today or an earlier day.")).toBeInTheDocument();
    expect(paymentRequests).toHaveLength(0);
  });

  it("shows the conflict message", async () => {
    const { onOpenChange } = renderDialog(1041);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Reference"), "TRX-2207");
    await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nothing to record a payment for");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("a double submit sends one request", async () => {
    const { onRecorded } = renderDialog(1045);
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Reference"), "TRX-2207");
    await userEvent.dblClick(within(dialog).getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    expect(paymentRequests).toHaveLength(1);
    expect(paymentRequests[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
