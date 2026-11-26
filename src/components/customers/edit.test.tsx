import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CUSTOMER_EDITOR, FAKE_API_URL, LUNA_ID, MIRA_ID, SALES_LEAD, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { CustomerPage } from "./customer-page";

const navigation = vi.hoisted(() => ({ id: "", notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/customers/${navigation.id}`,
  notFound: navigation.notFound,
}));

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

let sent: Promise<Sent>[] = [];
beforeEach(() => {
  sent = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "GET") return;
    const url = new URL(request.url);
    sent.push(request.clone().json().then((body: unknown) => ({ method: request.method, path: url.pathname, body })));
  });
});
afterEach(() => server.events.removeAllListeners());

const writes = () => Promise.all(sent);

async function open(id: string, user = STAFF) {
  navigation.id = id;
  renderAs(user, <CustomerPage />);
  await screen.findByRole("heading", { level: 1 });
}

const details = () => screen.getByRole("region", { name: "Details" });

describe("editing a customer", () => {
  it("sends only the changed shipping address, then shows it", async () => {
    await open(LUNA_ID);
    await within(details()).findByText("12 rue des Orfèvres");
    await userEvent.click(within(details()).getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit details" });
    const shipping = within(dialog).getByRole("group", { name: "Shipping address" });
    await userEvent.clear(within(shipping).getByLabelText("City"));
    await userEvent.type(within(shipping).getByLabelText("City"), "Villeurbanne");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await writes()).toEqual([
      {
        method: "PUT",
        path: `/customers/${LUNA_ID}/addresses`,
        body: { shipping_address: { name: "Luna Jewels", line1: "12 rue des Orfèvres", city: "Villeurbanne", postal_code: "69002", country: "FR", phone: "+33 4 72 00 00 00" } },
      },
    ]);
    expect(await within(details()).findByText("69002 Villeurbanne")).toBeInTheDocument();
    expect(within(details()).getByText("FR00123456789")).toBeInTheDocument();
    await waitFor(() => expect(within(details()).getByRole("button", { name: "Edit details" })).toHaveFocus());
  });

  it("sends billing_address null when Bill to the shipping address is ticked", async () => {
    fakeState().catalog.setAddresses(LUNA_ID, {
      billing_address: { name: "Luna Jewels SAS", line1: "4 place Bellecour", city: "Lyon", postal_code: "69002", country: "FR" },
    });
    await open(LUNA_ID);
    await within(details()).findByText("Luna Jewels SAS");
    await userEvent.click(within(details()).getByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit details" });
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Bill to the shipping address" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await writes()).map((write) => write.body)).toEqual([{ billing_address: null }]);
    expect(await within(details()).findByText("Same as shipping")).toBeInTheDocument();
  });

  it("saves Mira to pay first", async () => {
    await open(MIRA_ID);
    const money = await screen.findByRole("region", { name: "Money" });
    await userEvent.click(await within(money).findByRole("button", { name: "Edit terms" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit payment terms" });
    expect(within(dialog).getByLabelText("Credit limit (optional)")).toHaveValue("5000.00");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Pay first" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await writes()).toEqual([{ method: "PUT", path: `/customers/${MIRA_ID}/payment-terms`, body: { terms: "pay_first" } }]);
    expect(await within(money).findByText("Pays first. Nothing owed.")).toBeInTheDocument();
  });

  it("puts erp-api's refusal of pay later on the terms", async () => {
    server.use(
      http.put(`${FAKE_API_URL}/customers/:id/payment-terms`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "The customer's plan (Free) doesn't allow pay later", errors: [{ path: "terms", message: "The customer's plan (Free) doesn't allow pay later" }] },
          { status: 409 },
        ),
      ),
    );
    await open(LUNA_ID);
    const money = await screen.findByRole("region", { name: "Money" });
    await userEvent.click(await within(money).findByRole("button", { name: "Edit terms" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit payment terms" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Pay later" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("The customer's plan (Free) doesn't allow pay later")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit payment terms" })).toBeInTheDocument();
  });

  it("offers no Edit terms without payment.write", async () => {
    await open(LUNA_ID, CUSTOMER_EDITOR);
    const money = await screen.findByRole("region", { name: "Money" });
    await within(money).findByText("Pays first. Nothing owed.");
    expect(within(money).queryByRole("button", { name: "Edit terms" })).not.toBeInTheDocument();
    expect(within(details()).getByRole("button", { name: "Edit details" })).toBeInTheDocument();
  });

  it("renames Luna and turns the workshop pick off with one PATCH", async () => {
    await open(LUNA_ID);
    await userEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit customer" });
    await userEvent.clear(within(dialog).getByLabelText("Name"));
    await userEvent.type(within(dialog).getByLabelText("Name"), "Luna Atelier");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "May pick the workshop" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Luna Atelier" })).toBeInTheDocument();
    expect(await writes()).toEqual([{ method: "PATCH", path: `/customers/${LUNA_ID}`, body: { name: "Luna Atelier", may_pick_partner: false } }]);
    await waitFor(() => expect(within(details()).getByText("Picks the workshop").nextSibling).toHaveTextContent("No"));
  });

  it("shows erp-api's refusal of a name under Name", async () => {
    server.use(
      http.patch(`${FAKE_API_URL}/customers/:id`, () =>
        HttpResponse.json({ type: "urn:problem:validation", title: "Bad Request", status: 400, errors: [{ path: "name", message: "That name is taken here." }] }, { status: 400 }),
      ),
    );
    await open(LUNA_ID);
    await userEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit customer" });
    await userEvent.type(within(dialog).getByLabelText("Name"), " 2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("That name is taken here.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("asks before throwing away changes, and closes at once without any", async () => {
    await open(LUNA_ID);
    await userEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    let dialog = await screen.findByRole("dialog", { name: "Edit customer" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    dialog = await screen.findByRole("dialog", { name: "Edit customer" });
    await userEvent.type(within(dialog).getByLabelText("Name"), " SAS");
    await userEvent.keyboard("{Escape}");
    expect(within(dialog).getByText("Discard your changes?")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Keep editing" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Luna Jewels SAS");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await writes()).toEqual([]);
  });

  it("asks before disabling, then offers Enable, which doesn't ask", async () => {
    await open(LUNA_ID);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Disable" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Disable Luna Jewels?" });
    expect(confirm).toHaveTextContent("Its people won't be able to order or act for it until you enable it again. Its orders and data are kept.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Disable" }));

    const header = (await screen.findByRole("heading", { level: 1, name: "Luna Jewels" })).closest("header")!;
    expect(await within(header).findByText("Disabled")).toBeInTheDocument();
    expect(within(header).queryByRole("link", { name: "New order" })).not.toBeInTheDocument();
    await waitFor(() => expect(within(header).getByRole("button", { name: "Enable" })).toHaveFocus());
    await userEvent.click(within(header).getByRole("button", { name: "Enable" }));
    expect(await within(header).findByText("Active")).toBeInTheDocument();
    await waitFor(() => expect(within(header).getByRole("button", { name: "More actions" })).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect((await writes()).map((write) => write.body)).toEqual([{ status: "disabled" }, { status: "active" }]);
  });

  it("offers no Edit, More or Enable to someone who can't change customers", async () => {
    await open(LUNA_ID, SALES_LEAD);
    await within(details()).findByText("12 rue des Orfèvres");
    expect(screen.queryByRole("button", { name: "Edit customer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
  });
});
