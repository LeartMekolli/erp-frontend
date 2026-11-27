import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_NEW_CUSTOMER, newCustomerBody } from "@/lib/customers/form";
import { EMPTY_ADDRESS } from "@/lib/new-order/form";

import { FAKE_API_URL, LUNA_ID, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { CreateCustomerButton, NewCustomerForm } from "./new-customer-form";

interface Sent {
  key: string | null;
  body: unknown;
}

let sent: Promise<Sent>[] = [];
beforeEach(() => {
  sent = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/customers") return;
    const key = request.headers.get("idempotency-key");
    sent.push(request.clone().json().then((body: unknown) => ({ key, body })));
  });
});
afterEach(() => server.events.removeAllListeners());

const posts = () => Promise.all(sent);

/** The page-like owner: the form, with its footer drawn as the Create button. */
function open() {
  const onCreated = vi.fn();
  renderAs(STAFF, <NewCustomerForm layout="page" onCreated={onCreated} footer={(state) => <CreateCustomerButton {...state} />} />);
  return onCreated;
}

const section = (name: string) => screen.getByRole("region", { name });
const PERSON = "First person (optional)";
const createButton = () => screen.getByRole("button", { name: /^(Create customer|Creating…)$/ });

const SHIPPING = { ...EMPTY_ADDRESS, name: "Atelier Nord", line1: "Storgata 4", city: "Oslo", postal_code: "0155", country: "NO" };

async function fillName(name: string) {
  await userEvent.type(within(section("Customer")).getByLabelText("Name"), name);
}

async function fillShipping() {
  const shipping = section("Shipping address");
  await userEvent.type(within(shipping).getByLabelText("Name"), SHIPPING.name);
  await userEvent.type(within(shipping).getByLabelText("Address line 1"), SHIPPING.line1);
  await userEvent.type(within(shipping).getByLabelText("City"), SHIPPING.city);
  await userEvent.type(within(shipping).getByLabelText("Postal code"), SHIPPING.postal_code);
  await userEvent.type(within(shipping).getByLabelText("Country"), SHIPPING.country);
}

async function fillEmail(email: string) {
  await userEvent.type(within(section(PERSON)).getByLabelText("Email"), email);
}

const named = (name: string) => fakeState().catalog.names().filter((customer) => customer.name === name);

describe("NewCustomerForm", () => {
  it("creates one customer with what was typed and tells who was invited", async () => {
    const onCreated = open();
    await fillName("Atelier Nord");
    await fillShipping();
    await fillEmail("sofia@atelier.example");
    await userEvent.click(createButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const expected = newCustomerBody({ ...EMPTY_NEW_CUSTOMER, name: "Atelier Nord", shipping: SHIPPING, email: "sofia@atelier.example" });
    const requests = await posts();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toEqual(expected);
    expect(requests[0]!.key).toEqual(expect.any(String));
    expect(requests[0]!.key).not.toBe("");
    expect(onCreated.mock.calls[0]).toHaveLength(1);
    const [customer] = onCreated.mock.calls[0]!;
    expect(customer).toMatchObject({ name: "Atelier Nord", invitation: { email: "sofia@atelier.example", role: "owner", email_status: "queued" } });
    expect(named("Atelier Nord")).toHaveLength(1);
  });

  it("warns, without blocking, when the name is taken", async () => {
    const onCreated = open();
    await fillName("luna jewels");

    expect(await screen.findByText("A customer named Luna Jewels already exists.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /^Open Luna Jewels/ });
    expect(link).toHaveAttribute("href", `/customers/${LUNA_ID}`);
    expect(link).toHaveAttribute("target", "_blank");

    await userEvent.click(createButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0]![0]).toMatchObject({ name: "luna jewels", invitation: null });
  });

  it("puts a refused invitation email under Email and keeps everything typed", async () => {
    const onCreated = open();
    await fillName("Vardal Ceramics");
    await fillEmail(STAFF.email);
    await userEvent.click(createButton());

    const email = within(section(PERSON)).getByLabelText("Email");
    await waitFor(() => expect(email).toHaveAccessibleDescription("That email already has an account"));
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(within(section("Customer")).getByLabelText("Name")).toHaveValue("Vardal Ceramics");
    expect(email).toHaveValue(STAFF.email);
    expect(onCreated).not.toHaveBeenCalled();
    expect(named("Vardal Ceramics")).toHaveLength(0);
  });

  it("says a removed group above Create", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/customers`, () =>
        HttpResponse.json({ type: "about:blank", title: "Not Found", status: 404, detail: "Customer group not found" }, { status: 404 }),
      ),
    );
    const onCreated = open();
    await fillName("Vardal Ceramics");
    await userEvent.click(createButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Customer group not found");
    expect(within(section("Customer")).getByLabelText("Name")).toHaveValue("Vardal Ceramics");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("sends the same key again after a failed connection", async () => {
    server.use(http.post(`${FAKE_API_URL}/customers`, () => HttpResponse.error(), { once: true }));
    const onCreated = open();
    await fillName("Atelier Nord");
    await userEvent.click(createButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("AMI can't reach the server right now. Try again in a moment.");
    expect(onCreated).not.toHaveBeenCalled();
    await userEvent.click(createButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const requests = await posts();
    expect(requests).toHaveLength(2);
    expect(requests[0]!.key).toEqual(expect.any(String));
    expect(requests[1]!.key).toBe(requests[0]!.key);
    expect(named("Atelier Nord")).toHaveLength(1);
  });

  it("locks the form and says Creating… while it runs", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Answers nothing once let through, so the fake erp-api's own handler makes the customer.
    server.use(
      http.post(`${FAKE_API_URL}/customers`, async () => {
        await gate;
      }),
    );
    const onCreated = open();
    await fillName("Atelier Nord");
    await userEvent.click(createButton());

    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(within(section("Customer")).getByLabelText("Name")).toBeDisabled();
    expect(within(section(PERSON)).getByLabelText("Email")).toBeDisabled();

    release();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Create customer" })).toBeEnabled();
    expect(within(section("Customer")).getByLabelText("Name")).toBeEnabled();
  });
});
