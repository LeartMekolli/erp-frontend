import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/schema-types";

import { STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { ShipDialog } from "./ship-dialog";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

let shipRequests: (string | null)[] = [];
beforeEach(() => {
  shipRequests = [];
  server.events.on("request:start", ({ request }) => {
    if (request.url.endsWith("/ship")) shipRequests.push(request.headers.get("idempotency-key"));
  });
});
afterEach(() => server.events.removeAllListeners());

function renderDialog(number: number) {
  const onOpenChange = vi.fn();
  const onShipped = vi.fn();
  const rendered = renderAs(STAFF, <ShipDialog order={order(number)} open onOpenChange={onOpenChange} onShipped={onShipped} />);
  const invalidate = vi.spyOn(rendered.client, "invalidateQueries");
  return { ...rendered, onOpenChange, onShipped, invalidate };
}

describe("ShipDialog", () => {
  it("ships with courier and tracking", async () => {
    const { onOpenChange, onShipped, invalidate } = renderDialog(1042);
    const dialog = await screen.findByRole("dialog", { name: "Ship #1042" });
    expect(within(dialog).getByRole("radio", { name: "Enter tracking" })).toBeChecked();
    expect(within(dialog).getByText("The customer gets an email with the tracking number.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Courier"), "DHL");
    await userEvent.type(within(dialog).getByLabelText("Tracking number"), "JD014600006281");
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship order" }));

    await waitFor(() => expect(onShipped).toHaveBeenCalledWith("#1042 shipped."));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(order(1042).state).toBe("shipped");
    expect(order(1042).shipping).toMatchObject({ courier: "DHL", tracking: "JD014600006281" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orders"] });
  });

  it("ships with nothing filled", async () => {
    const { onShipped } = renderDialog(1042);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship order" }));

    await waitFor(() => expect(onShipped).toHaveBeenCalledWith("#1042 shipped."));
    // Empty fields are left out, not sent as empty text.
    expect(order(1042).shipping).toMatchObject({ courier: null, tracking: null });
  });

  it("buys a label and offers Print label", async () => {
    const { onOpenChange, onShipped, invalidate } = renderDialog(1043);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Buy a label" }));
    expect(
      within(dialog).getByText("The label uses this order's shipping method (Standard courier). Buying it takes a few seconds."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Courier")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship order" }));

    expect(await within(dialog).findByText("#1043 shipped.")).toBeInTheDocument();
    const print = within(dialog).getByRole("link", { name: /Print label/ });
    expect(print).toHaveAttribute("href", "https://labels.example.test/1043.pdf");
    expect(print).toHaveAttribute("target", "_blank");
    expect(order(1043).state).toBe("shipped");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orders"] });
    expect(onOpenChange).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onShipped).not.toHaveBeenCalled();
  });

  it("a 409 on a label offers Enter tracking instead", async () => {
    fakeState().orders.setCourierAccount(false);
    const { onOpenChange, invalidate } = renderDialog(1043);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Buy a label" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship order" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("No courier account");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orders"] });
    await userEvent.click(within(dialog).getByRole("button", { name: "Enter tracking instead" }));
    expect(within(dialog).getByRole("radio", { name: "Enter tracking" })).toBeChecked();
    expect(within(dialog).getByLabelText("Courier")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("a 503 keeps the order ready and Try again reuses the key", async () => {
    fakeState().orders.failNextLabel(order(1044).id);
    renderDialog(1044);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Buy a label" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship order" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The courier service refused the label: address incomplete");
    expect(order(1044).state).toBe("ready");
    await userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));

    expect(await within(dialog).findByText("#1044 shipped.")).toBeInTheDocument();
    expect(shipRequests).toHaveLength(2);
    expect(shipRequests[1]).toBe(shipRequests[0]);
    expect(order(1044).shipping.label?.url).toBe("https://labels.example.test/1044.pdf");
  });

  it("not ready shows the message and refetches", async () => {
    const { onOpenChange, onShipped, invalidate } = renderDialog(1041);
    const dialog = await screen.findByRole("dialog", { name: "Ship #1041" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship order" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Order is not ready to ship");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orders"] });
    expect(within(dialog).queryByRole("button", { name: "Enter tracking instead" })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onShipped).not.toHaveBeenCalled();
  });
});
