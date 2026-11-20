import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QuoteSummary } from "@/lib/api/schema-types";
import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";

import { GIFT_SET_ID } from "../../../test/fake-erp-api/catalog";
import { FAKE_API_URL, LUNA_ID, MIRA_ID, ORDER_TAKER } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { WithMe, renderAs } from "../../../test/render";

import { DeliverySection } from "./delivery-section";
import { OrderTicket } from "./order-ticket";
import type { RefusedField } from "./product-section";
import { useCheckout } from "./use-checkout";
import { usePlace } from "./use-place";
import type { Price } from "./use-price";

/** A real quote in the fake for one Gift set, so placing it works: €24.00. */
function giftSetQuote(customerId: string): QuoteSummary {
  const answer = fakeState().quotes.quote({ customer_id: customerId, product_id: GIFT_SET_ID, quantity: 1 });
  if (!answer.ok || !answer.body.accepted) throw new Error("the fake didn't price the Gift set");
  return answer.body.quote;
}

/** A price that is only shown, never placed. */
const SHOWN_ONLY: QuoteSummary = {
  id: "a9a9a9a9-0000-4000-8000-000000000001",
  product: { id: GIFT_SET_ID, name: "Gift set" },
  quantity: 10,
  currency: "EUR",
  lines: [{ label: "making", amount: "41.00" }],
  unit_price: "41.00",
  total: "410.00",
  expires_at: "2026-11-18T10:00:00.000Z",
  expired: false,
};

/** Section 3's answer, standing still: `quote` is shown. */
function shownPrice(quote: QuoteSummary): Price {
  return {
    ready: true,
    shown: { quote, changed: false },
    stale: null,
    refusals: [],
    fieldRefusals: new Map<RefusedField, readonly string[]>(),
    refusedFields: new Set<RefusedField>(),
    getPrice: () => {},
    adopt: () => {},
    adoptRefusals: () => {},
    clear: () => {},
    pending: false,
    error: null,
  };
}

const NO_MODEL = { held: false, ready: false };
const NO_FILE = { held: null, measures: [] };

/** The Delivery panel beside the ticket, whose main button places the order and shows why it can't. */
function Harness({ customerId, quote, onPlaced }: { customerId: string; quote: QuoteSummary; onPlaced: (id: string) => void }) {
  const form = useForm<NewOrderValues>({ defaultValues: { ...EMPTY_VALUES, customerId } });
  const price = shownPrice(quote);
  const placing = usePlace({ form, price, quoteKey: "shown", onPlaced });
  // A shown price makes the main action Place, so the product and model don't matter here.
  const checkout = useCheckout({ form, price, placing, model: NO_MODEL, product: undefined });
  return (
    <FormProvider {...form}>
      <DeliverySection checkout={checkout} placing={placing} />
      <OrderTicket checkout={checkout} price={price} placing={placing} model={NO_FILE} />
    </FormProvider>
  );
}

function renderDelivery(customerId: string, quote: QuoteSummary) {
  const onPlaced = vi.fn();
  renderAs(
    ORDER_TAKER,
    <WithMe>
      <Harness customerId={customerId} quote={quote} onPlaced={onPlaced} />
    </WithMe>,
  );
  return onPlaced;
}

/** Every POST that went out, with its body and idempotency key. */
let posts: { path: string; key: string | null; body: Promise<unknown> }[] = [];
const sentTo = (path: string) => Promise.all(posts.filter((post) => post.path === path).map((post) => post.body));
const keysTo = (path: string) => posts.filter((post) => post.path === path).map((post) => post.key);

beforeEach(() => {
  posts = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "POST") return;
    posts.push({
      path: new URL(request.url).pathname,
      key: request.headers.get("idempotency-key"),
      body: request.clone().json(),
    });
  });
});

afterEach(() => {
  server.events.removeAllListeners();
  setOnline(true);
});

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

const MIRA_ADDRESS = { name: "Mira Studio", line1: "3 Canal Street", city: "Leeds", postal_code: "LS1 4AB", country: "GB" };

/** Types Mira's address into the form, its optional fields left blank. */
async function typeMiraAddress() {
  await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), MIRA_ADDRESS.name);
  await userEvent.type(screen.getByRole("textbox", { name: "Address line 1" }), MIRA_ADDRESS.line1);
  await userEvent.type(screen.getByRole("textbox", { name: "City" }), MIRA_ADDRESS.city);
  await userEvent.type(screen.getByRole("textbox", { name: "Postal code" }), MIRA_ADDRESS.postal_code);
  await userEvent.type(screen.getByRole("textbox", { name: "Country" }), "gb");
}

describe("DeliverySection", () => {
  it("uses Luna's saved address", async () => {
    const quote = giftSetQuote(LUNA_ID);
    const onPlaced = renderDelivery(LUNA_ID, quote);

    const address = await screen.findByRole("group", { name: "Address" });
    expect(await within(address).findByText("Luna Jewels, 12 rue des Orfèvres, 69002 Lyon, FR")).toBeInTheDocument();
    expect(within(address).getByText("(saved)")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    // Shipping is asked for the saved address, which erp-api reads itself.
    await screen.findByRole("radio", { name: "Courier · €12.00" });
    expect(await sentTo("/orders/shipping-rates")).toEqual([{ customer_id: LUNA_ID }]);

    // Change opens the form for this order, starting from the saved address; staff can go back.
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("Luna Jewels");
    expect(name).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Use the saved address" }));
    expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toHaveFocus();

    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    const place = screen.getByRole("button", { name: "Place order" });
    expect(place).toHaveAttribute("aria-disabled", "false");
    await userEvent.click(place);

    await waitFor(() => expect(onPlaced).toHaveBeenCalledTimes(1));
    expect(await sentTo("/orders")).toEqual([{ customer_id: LUNA_ID, lines: [{ quote_id: quote.id }], shipping_method: "courier" }]);
    const order = fakeState().orders.all().find((candidate) => candidate.id === onPlaced.mock.calls[0]?.[0]);
    expect(order?.address).toMatchObject({ name: "Luna Jewels", city: "Lyon" });
  });

  it("asks Mira for an address", async () => {
    const quote = giftSetQuote(MIRA_ID);
    const onPlaced = renderDelivery(MIRA_ID, quote);

    // No saved address: the form is open from the start, with no way back to one.
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use the saved address" })).not.toBeInTheDocument();
    expect(screen.getByText("Fill in the address to see the shipping methods.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toHaveAttribute("aria-disabled", "true");

    await typeMiraAddress();
    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Note" }), "  Leave it at reception.  ");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveAccessibleDescription("26 / 2,000");
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    await waitFor(() => expect(onPlaced).toHaveBeenCalledTimes(1));
    // Asked and sent only once complete, with the blank optional fields left out and the note trimmed.
    expect(await sentTo("/orders/shipping-rates")).toEqual([{ customer_id: MIRA_ID, address: MIRA_ADDRESS }]);
    expect(await sentTo("/orders")).toEqual([
      {
        customer_id: MIRA_ID,
        lines: [{ quote_id: quote.id }],
        shipping_method: "courier",
        address: MIRA_ADDRESS,
        note: "Leave it at reception.",
      },
    ]);
  });

  it("asks for shipping once a complete address stops changing, not on every keystroke", async () => {
    renderDelivery(MIRA_ID, giftSetQuote(MIRA_ID));
    await typeMiraAddress();
    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    expect(await sentTo("/orders/shipping-rates")).toEqual([{ customer_id: MIRA_ID, address: MIRA_ADDRESS }]);

    // Seven more characters in an already complete address: the methods go at once, so Place can't send
    // an address they weren't asked for, and nothing is asked until the typing pauses.
    await userEvent.type(screen.getByRole("textbox", { name: /^Phone/ }), "0123456");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Loading the shipping methods…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toHaveAttribute("aria-disabled", "true");
    expect(await sentTo("/orders/shipping-rates")).toHaveLength(1);

    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    expect(await sentTo("/orders/shipping-rates")).toEqual([
      { customer_id: MIRA_ID, address: MIRA_ADDRESS },
      { customer_id: MIRA_ID, address: { ...MIRA_ADDRESS, phone: "0123456" } },
    ]);
  });

  it("greys an unavailable method with its reason", async () => {
    renderDelivery(LUNA_ID, SHOWN_ONLY);
    const express = await screen.findByRole("radio", { name: "Express courier" });
    expect(express).toBeDisabled();
    expect(express).toHaveAccessibleDescription("No courier account is set up");
    expect(screen.getByRole("radio", { name: "Courier · €12.00" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Collect · €0.00" })).toBeEnabled();
  });

  it("puts erp-api's field errors on the address and shipping", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/orders`, () =>
        HttpResponse.json(
          {
            type: "urn:problem:validation",
            title: "Validation failed",
            status: 400,
            errors: [
              { path: "address.postal_code", message: "Not a postal code in GB" },
              { path: "shipping_method", message: "Courier doesn't go there" },
            ],
          },
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    const onPlaced = renderDelivery(MIRA_ID, giftSetQuote(MIRA_ID));
    await typeMiraAddress();
    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("Check the marked fields.");
    await waitFor(() => expect(message).toHaveFocus());
    const postal = screen.getByRole("textbox", { name: "Postal code" });
    expect(postal).toHaveAttribute("aria-invalid", "true");
    expect(postal).toHaveAccessibleDescription("Not a postal code in GB");
    expect(screen.getByRole("radiogroup", { name: "Shipping" })).toHaveAccessibleDescription("Courier doesn't go there");
    expect(onPlaced).not.toHaveBeenCalled();

    // Editing the field takes erp-api's reason away; the other field's stays.
    await userEvent.type(postal, "X");
    expect(postal).toHaveAttribute("aria-invalid", "false");
    // The new address asks for shipping again; once listed, the methods still carry erp-api's reason.
    expect(await screen.findByRole("radiogroup", { name: "Shipping" })).toHaveAccessibleDescription("Courier doesn't go there");
  });

  it("asks for a method again when a new address no longer offers the chosen one", async () => {
    // The fake lists the same methods for any address; here Courier isn't offered to a changed one.
    server.use(
      http.post(`${FAKE_API_URL}/orders/shipping-rates`, async ({ request }) => {
        const { address } = (await request.json()) as { address?: unknown };
        const collect = { key: "collect", name: "Collect", price: "0.00", available: true, reason: null };
        const courier = { key: "courier", name: "Courier", price: "12.00", available: true, reason: null };
        return HttpResponse.json({ data: address ? [collect] : [courier, collect] });
      }),
    );
    renderDelivery(LUNA_ID, giftSetQuote(LUNA_ID));
    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    const place = screen.getByRole("button", { name: "Place order" });
    expect(place).toHaveAttribute("aria-disabled", "false");
    expect(place).toHaveAccessibleDescription("");

    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    // Once the new address's methods are listed, Courier is not among them.
    expect(await screen.findByText("Pick a shipping method.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Collect · €0.00" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Courier/ })).not.toBeInTheDocument();
    expect(place).toHaveAttribute("aria-disabled", "true");
    expect(place).toHaveAccessibleDescription("Pick a shipping method.");

    await userEvent.click(screen.getByRole("radio", { name: "Collect · €0.00" }));
    expect(place).toHaveAttribute("aria-disabled", "false");
    expect(place).toHaveAccessibleDescription("");
  });

  it("sends nothing when Place is pressed offline, and keeps what was entered", async () => {
    const onPlaced = renderDelivery(MIRA_ID, giftSetQuote(MIRA_ID));
    await typeMiraAddress();
    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Note" }), "Leave it at reception.");
    const place = screen.getByRole("button", { name: "Place order" });
    expect(place).toHaveAttribute("aria-disabled", "false");

    act(() => setOnline(false));
    expect(place).toHaveAttribute("aria-disabled", "true");
    expect(place).toHaveAccessibleDescription("You're offline.");
    await userEvent.click(place);
    expect(keysTo("/orders")).toEqual([]);
    expect(onPlaced).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(MIRA_ADDRESS.name);
    expect(screen.getByRole("textbox", { name: "City" })).toHaveValue(MIRA_ADDRESS.city);
    expect(screen.getByRole("radio", { name: "Courier · €12.00" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Leave it at reception.");

    act(() => setOnline(true));
    expect(place).toHaveAttribute("aria-disabled", "false");
    expect(place).toHaveAccessibleDescription("");
    await userEvent.click(place);
    await waitFor(() => expect(onPlaced).toHaveBeenCalledTimes(1));
    expect(await sentTo("/orders")).toEqual([
      {
        customer_id: MIRA_ID,
        lines: [{ quote_id: expect.any(String) as string }],
        shipping_method: "courier",
        address: MIRA_ADDRESS,
        note: "Leave it at reception.",
      },
    ]);
  });

  it("sends one order for a double click on Place", async () => {
    // erp-api answers only once released, so the second click comes while the first is still running.
    let release = () => {};
    const answer = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(`${FAKE_API_URL}/orders`, async () => {
        await answer;
        return HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "A quote is ordered once" },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        );
      }),
    );
    const onPlaced = renderDelivery(LUNA_ID, giftSetQuote(LUNA_ID));
    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));

    await userEvent.dblClick(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(keysTo("/orders")).toHaveLength(1));

    release();
    expect(await screen.findByRole("alert")).toHaveTextContent("A quote is ordered once");
    expect(keysTo("/orders")).toHaveLength(1);
    expect(onPlaced).not.toHaveBeenCalled();
  });

  it("sends the same key when Place is retried after no answer", async () => {
    server.use(http.post(`${FAKE_API_URL}/orders`, () => HttpResponse.error(), { once: true }));
    const onPlaced = renderDelivery(LUNA_ID, giftSetQuote(LUNA_ID));
    const ordersBefore = fakeState().orders.all().length;
    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    const place = screen.getByRole("button", { name: "Place order" });
    await userEvent.click(place);

    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("AMI can't reach the server right now. Try again in a moment.");
    await waitFor(() => expect(place).toHaveAttribute("aria-disabled", "false"));
    await userEvent.click(place);

    await waitFor(() => expect(onPlaced).toHaveBeenCalledTimes(1));
    const keys = keysTo("/orders");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    // erp-api replayed the first request's key: one order only.
    expect(fakeState().orders.all()).toHaveLength(ordersBefore + 1);
  });
});
