import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/schema-types";

import { FAKE_API_URL, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { BulkShipDialog } from "./bulk-ship-dialog";

const order = (number: number): Order => fakeState().orders.all().find((o) => o.number === number)!;

/** Each bulk ship request as it starts: its order ids and its Idempotency-Key. */
let shipped: { ids: string[]; key: string | null }[] = [];
beforeEach(() => {
  shipped = [];
  server.events.on("request:start", ({ request }) => {
    if (!new URL(request.url).pathname.endsWith("/orders/ship")) return;
    const key = request.headers.get("idempotency-key");
    void request
      .clone()
      .json()
      .then((body: { orders: { order_id: string }[] }) => shipped.push({ ids: body.orders.map((entry) => entry.order_id), key }));
  });
});
afterEach(() => server.events.removeAllListeners());

function renderDialog(...numbers: number[]) {
  const onOpenChange = vi.fn();
  const onShipped = vi.fn();
  const rendered = renderAs(
    STAFF,
    <BulkShipDialog orders={numbers.map(order)} open onOpenChange={onOpenChange} onShipped={onShipped} />,
  );
  const invalidate = vi.spyOn(rendered.client, "invalidateQueries");
  return { ...rendered, onOpenChange, onShipped, invalidate };
}

describe("BulkShipDialog", () => {
  it("skips orders that aren't ready", async () => {
    renderDialog(1041, 1042, 1044);
    const dialog = await screen.findByRole("dialog", { name: "Ship 2 orders" });
    expect(await within(dialog).findByRole("radio", { name: "Mark as shipped" })).toBeChecked();
    expect(within(dialog).getByText("Tracking numbers can be added one order at a time.")).toBeInTheDocument();
    expect(within(dialog).getByText("1 selected order isn't ready and is skipped.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Courier"), "DHL");
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship 2 orders" }));

    expect(await within(dialog).findByText("2 shipped")).toBeInTheDocument();
    // One request for both.
    expect(shipped).toEqual([{ ids: [order(1042).id, order(1044).id], key: expect.any(String) as string }]);
    expect(order(1041).state).toBe("in_production");
    expect(order(1042).shipping.courier).toBe("DHL");
    expect(order(1044).state).toBe("shipped");
  });

  it("reports which shipped and which didn't", async () => {
    fakeState().orders.failNextLabel(order(1043).id);
    const { onOpenChange, onShipped, invalidate } = renderDialog(1042, 1043, 1044);
    const dialog = await screen.findByRole("dialog", { name: "Ship 3 orders" });
    await userEvent.click(await within(dialog).findByRole("radio", { name: "Buy labels" }));
    expect(within(dialog).getByText("Each label takes a few seconds.")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Courier")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship 3 orders" }));

    expect(await within(dialog).findByText("2 shipped")).toBeInTheDocument();
    expect(within(dialog).getByText("1 not shipped")).toBeInTheDocument();
    const failed = within(dialog).getByRole("list", { name: "Not shipped" });
    expect(failed).toHaveTextContent("#1043");
    expect(failed).toHaveTextContent("The courier service refused the label: address incomplete");

    // Try again sends only the failed order, in a new request with a new key.
    await userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByText("3 shipped")).toBeInTheDocument();
    expect(within(dialog).queryByText(/not shipped/)).not.toBeInTheDocument();
    expect(shipped).toHaveLength(2);
    expect(shipped[1]!.ids).toEqual([order(1043).id]);
    expect(shipped[1]!.key).not.toBe(shipped[0]!.key);

    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const ids = onShipped.mock.calls[0]![0] as string[];
    expect([...ids].sort()).toEqual([order(1042).id, order(1043).id, order(1044).id].sort());
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orders"] }));
  });

  it("offers Print label links for bought labels", async () => {
    renderDialog(1042, 1044);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("radio", { name: "Buy labels" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship 2 orders" }));

    expect(await within(dialog).findByText("2 shipped")).toBeInTheDocument();
    for (const number of [1042, 1044]) {
      const link = within(dialog).getByRole("link", { name: `Print label for #${number}` });
      expect(link).toHaveAttribute("href", `https://labels.example.test/${number}.pdf`);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("resends an unanswered request with its key", async () => {
    server.use(http.post(`${FAKE_API_URL}/orders/ship`, () => HttpResponse.error(), { once: true }));
    renderDialog(1042, 1044);
    const dialog = await screen.findByRole("dialog", { name: "Ship 2 orders" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship 2 orders" }));

    expect(await within(dialog).findByText("2 not shipped")).toBeInTheDocument();
    expect(order(1042).state).toBe("ready");
    await userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));

    expect(await within(dialog).findByText("2 shipped")).toBeInTheDocument();
    await waitFor(() => expect(shipped).toHaveLength(2));
    expect(shipped[1]).toEqual(shipped[0]);
  });

  it("refreshes the list when an order had already shipped", async () => {
    const { invalidate } = renderDialog(1042, 1044);
    const dialog = await screen.findByRole("dialog", { name: "Ship 2 orders" });
    // Shipped elsewhere after the dialog opened.
    fakeState().orders.ship(order(1044).id, {}, null);
    await userEvent.click(within(dialog).getByRole("button", { name: "Ship 2 orders" }));

    expect(await within(dialog).findByText("1 not shipped")).toBeInTheDocument();
    expect(within(dialog).getByRole("list", { name: "Not shipped" })).toHaveTextContent("#1044 is already shipped.");
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["orders"] }));
  });

  it("offers only Mark as shipped when labels aren't set up", async () => {
    fakeState().orders.setCourierAccount(false);
    renderDialog(1042, 1044);
    const dialog = await screen.findByRole("dialog", { name: "Ship 2 orders" });
    expect(await within(dialog).findByLabelText("Courier")).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: "Buy labels" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: "Mark as shipped" })).not.toBeInTheDocument();
  });
});
