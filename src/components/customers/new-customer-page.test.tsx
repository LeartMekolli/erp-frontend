import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetArrivalNotes } from "@/lib/navigation/arrival-note";

import { CLERK, SALES_LEAD, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { renderAs } from "../../../test/render";

import { CustomerPage } from "./customer-page";
import { NewCustomerPage } from "./new-customer-page";

const navigation = vi.hoisted(() => ({ id: "", notFound: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
  usePathname: () => "/customers/new",
  notFound: navigation.notFound,
}));

beforeEach(() => {
  navigation.notFound.mockReset();
  navigation.push.mockReset();
});
afterEach(() => resetArrivalNotes());

const section = (name: string) => screen.getByRole("region", { name });

async function fillRequired(name: string) {
  await userEvent.type(within(section("Customer")).getByLabelText("Name"), name);
  const shipping = section("Shipping address");
  await userEvent.type(within(shipping).getByLabelText("Name"), name);
  await userEvent.type(within(shipping).getByLabelText("Address line 1"), "Storgata 4");
  await userEvent.type(within(shipping).getByLabelText("City"), "Oslo");
  await userEvent.type(within(shipping).getByLabelText("Postal code"), "0155");
  await userEvent.type(within(shipping).getByLabelText("Country"), "NO");
}

describe("NewCustomerPage", () => {
  it("lands on the new customer's page, which says it was created and who was invited", async () => {
    renderAs(STAFF, <NewCustomerPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "New customer" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/customers");
    expect(screen.getByText("Everything is saved together when you press Create.")).toBeInTheDocument();

    await fillRequired("Atelier Nord");
    await userEvent.type(within(section("First person (optional)")).getByLabelText("Email"), "sofia@atelier.example");
    await userEvent.click(screen.getByRole("button", { name: "Create customer" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    const href = navigation.push.mock.calls[0]![0] as string;
    const id = href.replace("/customers/", "");
    expect(href).toBe(`/customers/${id}`);
    expect(id).not.toBe("new");

    // The note waits for the customer's page, which reads it.
    navigation.id = id;
    renderAs(STAFF, <CustomerPage />);
    const created = (await screen.findByText("Atelier Nord was created.")).closest("[role=status]");
    expect(created).not.toBeNull();
    expect(created).toHaveTextContent("An invitation is on its way to sofia@atelier.example.");
    expect(screen.queryByRole("button", { name: "Send again" })).not.toBeInTheDocument();
  });

  it("asks before leaving with anything typed", async () => {
    renderAs(STAFF, <NewCustomerPage />);
    await screen.findByRole("heading", { level: 1, name: "New customer" });
    await userEvent.click(screen.getByRole("link", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.type(within(section("Customer")).getByLabelText("Name"), "Atelier Nord");
    await userEvent.click(screen.getByRole("link", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave without creating?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("link", { name: "Cancel" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Leave" }));
    expect(navigation.push).toHaveBeenCalledWith("/customers");
  });

  it("isn't there without customer.write", async () => {
    renderAs(SALES_LEAD, <NewCustomerPage />);
    await waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
    renderAs(CLERK, <NewCustomerPage />);
    await waitFor(() => expect(navigation.notFound.mock.calls.length).toBeGreaterThan(1));
  });

  it("creates with ⌘Enter", async () => {
    renderAs(STAFF, <NewCustomerPage />);
    await screen.findByRole("heading", { level: 1, name: "New customer" });
    await fillRequired("Vardal Ceramics");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    expect(fakeState().catalog.names().filter((customer) => customer.name === "Vardal Ceramics")).toHaveLength(1);
  });
});
