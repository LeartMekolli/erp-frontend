import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomerMoney, InvitationEmailStatus, Order, SentInvitation } from "@/lib/api/schema-types";

import { leaveArrivalNote, resetArrivalNotes } from "@/lib/navigation/arrival-note";

import { takeArrivalNote } from "../../../test/arrival-note";
import { CUSTOMERS } from "../../../test/fake-erp-api/orders-seed";
import {
  CLERK,
  CUSTOMER_READER,
  FAKE_API_URL,
  LUNA_ID,
  MIRA_ID,
  OLD_WORKS_ID,
  ORDER_TAKER,
  SALES_LEAD,
  STAFF,
} from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { byMonth } from "./orders-panel";
import { CustomerPage } from "./customer-page";

const navigation = vi.hoisted(() => ({ id: "", notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/customers/${navigation.id}`,
  notFound: navigation.notFound,
}));

beforeEach(() => navigation.notFound.mockReset());
afterEach(() => {
  resetArrivalNotes();
  vi.restoreAllMocks();
});

/** Sofia's invitation as New customer hands it over, with what became of its email. */
const invitation = (email_status: InvitationEmailStatus): SentInvitation => ({
  id: "5e5e5e5e-0000-4000-8000-000000000001",
  email: "sofia@atelier.example",
  role: "owner",
  expires_at: "2026-12-04T09:00:00.000Z",
  email_status,
});

/** The live region that says the customer was created. */
async function createdStatus(): Promise<HTMLElement> {
  const status = (await screen.findByText("Luna Jewels was created.")).closest<HTMLElement>("[role=status]");
  expect(status).not.toBeNull();
  return status!;
}

const FAILED = (status: number) => HttpResponse.json({ type: "about:blank", title: "Error", status }, { status });

function open(id: string, user = STAFF) {
  navigation.id = id;
  return renderAs(user, <CustomerPage />);
}

const panel = (name: string) => screen.getByRole("region", { name });

/** The page's header, found from its h1: inside the app's main it's no landmark. */
async function header(name: string): Promise<HTMLElement> {
  return (await screen.findByRole("heading", { level: 1, name })).closest("header")!;
}

/** Seed orders given new numbers and placing times, as erp-api would list them for one customer. */
function ordersPlaced(times: string[]): Order[] {
  const base = fakeState().orders.all().find((order) => order.number === 1042)!;
  return times.map((placed_at, index) => ({ ...structuredClone(base), id: `22222222-0000-4000-8000-${String(900 + index).padStart(12, "0")}`, number: 2000 + index, placed_at }));
}

describe("CustomerPage", () => {
  it("shows Luna's header, with only the page title as h1", async () => {
    open(LUNA_ID);
    expect(await screen.findByRole("heading", { level: 1, name: "Luna Jewels" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const head = await header("Luna Jewels");
    for (const text of ["Active", "Trade", "Standard band", "Free plan", "Customer since March 2026"]) expect(within(head).getByText(text)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute("href", "/customers");
  });

  it("shows where Luna ships and bills, her VAT number and the workshop pick", async () => {
    open(LUNA_ID);
    await screen.findByRole("heading", { level: 2, name: "Details" });
    const details = panel("Details");
    expect(await within(details).findByText("12 rue des Orfèvres")).toBeInTheDocument();
    expect(within(details).getByText("69002 Lyon")).toBeInTheDocument();
    expect(within(details).getByText("France")).toBeInTheDocument();
    expect(within(details).getByText("Same as shipping")).toBeInTheDocument();
    expect(within(details).getByText("FR00123456789")).toBeInTheDocument();
    expect(within(details).getByText("Picks the workshop").nextSibling).toHaveTextContent("Yes");
  });

  it("says when no shipping address is saved, and doesn't bill to it", async () => {
    open(MIRA_ID);
    expect(await screen.findByText("No shipping address yet")).toBeInTheDocument();
    expect(within(panel("Details")).getByText("No billing address yet")).toBeInTheDocument();
    expect(within(panel("Details")).queryByText("Same as shipping")).not.toBeInTheDocument();
  });

  it("shows an overdue invoice with its order, and Pinewood's terms", async () => {
    open(CUSTOMERS.pinewood.id);
    const money = await screen.findByRole("region", { name: "Money" });
    expect(await within(money).findByText("1 invoice overdue")).toBeInTheDocument();
    const order = fakeState().orders.all().find((candidate) => candidate.number === 1047)!;
    expect(within(money).getByRole("link", { name: /#1047/ })).toHaveAttribute("href", `/orders/${order.id}`);
    expect(within(money).getByText("Pay later · 30 days")).toBeInTheDocument();
    expect(within(money).getByText("No limit")).toBeInTheDocument();
  });

  it("lists overdue invoices before open ones, each open one with its PDF", async () => {
    const owed: CustomerMoney = {
      terms: "pay_later",
      days_to_pay: 30,
      credit_limit: "5000.00",
      currency: "EUR",
      exposure: "1240.00",
      balance: "1240.00",
      overdue_invoices: [{ order_id: "22222222-0000-4000-8000-000000001031", order_number: 1031, total: "480.00", currency: "EUR", due_on: "2026-11-03", url: null }],
      open_invoices: [{ order_id: "22222222-0000-4000-8000-000000001040", order_number: 1040, total: "760.00", currency: "EUR", due_on: "2026-11-30", url: "https://invoices.example.test/1040.pdf" }],
    };
    server.use(http.get(`${FAKE_API_URL}/payments/customers/:id`, () => HttpResponse.json(owed)));
    open(MIRA_ID);
    const money = await screen.findByRole("region", { name: "Money" });
    expect(await within(money).findByText("€1,240.00")).toBeInTheDocument();
    expect(within(money).getByText("€5,000.00")).toBeInTheDocument();
    const links = within(money).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([expect.stringContaining("#1031"), expect.stringContaining("#1040"), ""]);
    expect(within(money).getByRole("link", { name: "Invoice PDF for order #1040" })).toHaveAttribute("href", "https://invoices.example.test/1040.pdf");
    expect(within(money).getByRole("link", { name: "Invoice PDF for order #1040" })).toHaveAttribute("target", "_blank");
    expect(within(money).queryByRole("link", { name: "Invoice PDF for order #1031" })).not.toBeInTheDocument();
  });

  it("says a pay-first customer owes nothing", async () => {
    open(LUNA_ID);
    const money = await screen.findByRole("region", { name: "Money" });
    expect(await within(money).findByText("Pays first. Nothing owed.")).toBeInTheDocument();
    expect(within(money).queryByText("Credit limit")).not.toBeInTheDocument();
  });

  it("lists Luna's orders newest first under their month, each linking to the order", async () => {
    open(LUNA_ID);
    const orders = await screen.findByRole("region", { name: "Orders" });
    const links = await within(orders).findAllByRole("link");
    const [newer, older] = [1048, 1042].map((number) => fakeState().orders.all().find((order) => order.number === number)!);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([`/orders/${newer!.id}`, `/orders/${older!.id}`]);
    expect(links[0]).toHaveTextContent("12 × Ring band");
    expect(links[0]).toHaveTextContent("#1048");
    expect(links[0]).toHaveTextContent("In production");
    const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(newer!.placed_at));
    expect(within(orders).getByRole("heading", { level: 3, name: month })).toBeInTheDocument();
  });

  it("reads an overdue order's invoice in late ink", async () => {
    open(CUSTOMERS.pinewood.id);
    const orders = await screen.findByRole("region", { name: "Orders" });
    expect(await within(orders).findByText(/^Invoice overdue since/)).toBeInTheDocument();
  });

  it("keeps one heading for a month spread over two pages, with Show more after 10", async () => {
    const november = ordersPlaced(Array.from({ length: 12 }, (_, n) => `2026-11-${String(24 - n).padStart(2, "0")}T10:00:00.000Z`));
    const october = ordersPlaced(["2026-10-30T10:00:00.000Z"]).map((order) => ({ ...order, id: "22222222-0000-4000-8000-000000000999", number: 1999 }));
    server.use(
      http.get(`${FAKE_API_URL}/orders`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(cursor ? { data: [...november.slice(10), ...october], next_cursor: null } : { data: november.slice(0, 10), next_cursor: "10" });
      }),
    );
    open(LUNA_ID);
    const orders = await screen.findByRole("region", { name: "Orders" });
    await within(orders).findByRole("heading", { level: 3, name: "November 2026" });
    expect(within(orders).getAllByRole("link")).toHaveLength(10);
    await userEvent.click(within(orders).getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(within(orders).getAllByRole("link")).toHaveLength(13));
    expect(within(orders).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["November 2026", "October 2026"]);
  });

  it("groups by the workspace's month, not UTC's", () => {
    const [late] = ordersPlaced(["2026-10-31T23:30:00.000Z"]);
    expect(byMonth([late!], "Europe/Belgrade").map((month) => month.name)).toEqual(["November 2026"]);
    expect(byMonth([late!], "UTC").map((month) => month.name)).toEqual(["October 2026"]);
  });

  it("says when a customer has no orders yet, with New order", async () => {
    server.use(http.get(`${FAKE_API_URL}/orders`, () => HttpResponse.json({ data: [], next_cursor: null })));
    open(LUNA_ID);
    const orders = await screen.findByRole("region", { name: "Orders" });
    expect(await within(orders).findByText("No orders yet")).toBeInTheDocument();
    expect(within(orders).getByRole("link", { name: "New order" })).toBeInTheDocument();
  });

  it("shows no Money without payment.read, and no Orders without order.read", async () => {
    open(LUNA_ID, ORDER_TAKER);
    await screen.findByRole("region", { name: "Details" });
    expect(screen.getByRole("region", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Money" })).not.toBeInTheDocument();
  });

  it("shows only Details to someone who reads customers alone", async () => {
    open(LUNA_ID, CUSTOMER_READER);
    await screen.findByRole("region", { name: "Details" });
    expect(screen.queryByRole("region", { name: "Orders" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Money" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New order" })).not.toBeInTheDocument();
  });

  it("says when the customer doesn't exist", async () => {
    open("9a9a9a9a-0000-4000-8000-000000000000");
    expect(await screen.findByRole("heading", { level: 1, name: "This customer doesn't exist or was removed." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to customers" })).toHaveAttribute("href", "/customers");
  });

  it("says an address that isn't a customer id doesn't exist, without Try again", async () => {
    server.use(http.get(`${FAKE_API_URL}/customers/:id`, () => FAILED(400)));
    open("abc");
    expect(await screen.findByRole("heading", { level: 1, name: "This customer doesn't exist or was removed." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps Details when Money fails", async () => {
    server.use(http.get(`${FAKE_API_URL}/payments/customers/:id`, () => FAILED(500)));
    open(LUNA_ID);
    expect(await screen.findByText("The money couldn't be loaded.")).toBeInTheDocument();
    expect(await within(panel("Details")).findByText("12 rue des Orfèvres")).toBeInTheDocument();
  });

  it("offers New order for an active customer, leaving New order a note to start with them", async () => {
    open(LUNA_ID);
    const head = await header("Luna Jewels");
    const link = within(head).getByRole("link", { name: "New order" });
    expect(link).toHaveAttribute("href", "/orders/new");
    // jsdom can't navigate: the click only leaves the note.
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(takeArrivalNote("/orders/new")).toEqual({ customer: LUNA_ID });
  });

  it("leaves no note for a New order opened in another tab", async () => {
    open(LUNA_ID);
    const link = within(await header("Luna Jewels")).getByRole("link", { name: "New order" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, { metaKey: true });
    expect(takeArrivalNote("/orders/new")).toBeNull();
  });

  it("says nothing about being created when opened another way", async () => {
    open(LUNA_ID);
    await screen.findByRole("heading", { level: 1, name: "Luna Jewels" });
    expect(screen.queryByText(/was created/)).not.toBeInTheDocument();
  });

  it("says it was created, and who was invited, when New customer sent us here", async () => {
    leaveArrivalNote(`/customers/${LUNA_ID}`, { created: { invitation: invitation("queued") } });
    open(LUNA_ID);
    const status = await createdStatus();
    expect(status).toHaveTextContent("Luna Jewels was created.");
    expect(status).toHaveTextContent("An invitation is on its way to sofia@atelier.example.");
    expect(screen.queryByRole("button", { name: "Send again" })).not.toBeInTheDocument();
  });

  it("says only that it was created when nobody was invited", async () => {
    leaveArrivalNote(`/customers/${LUNA_ID}`, { created: { invitation: null } });
    open(LUNA_ID);
    const status = await createdStatus();
    expect(status).toHaveTextContent(/^Luna Jewels was created\.$/);
    expect(screen.queryByRole("button", { name: "Send again" })).not.toBeInTheDocument();
  });

  it("says the invitation wasn't sent without a customer site, and sends it again", async () => {
    leaveArrivalNote(`/customers/${LUNA_ID}`, { created: { invitation: invitation("no_customer_site") } });
    open(LUNA_ID);
    const status = await createdStatus();
    expect(status).toHaveTextContent(
      "The invitation to sofia@atelier.example wasn't sent: its link goes to the workspace's customer site, and this workspace doesn't have one yet. Send it again here once it does, before you leave this page.",
    );
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden");

    fakeState().catalog.setInvitationEmail("queued");
    await userEvent.click(screen.getByRole("button", { name: "Send again" }));

    await waitFor(() => expect(status).toHaveTextContent("An invitation is on its way to sofia@atelier.example."));
    expect(status).not.toHaveTextContent("wasn't sent");
    expect(screen.queryByRole("button", { name: "Send again" })).not.toBeInTheDocument();
    // Send again went with the answer, so focus is on the notice, not lost to the page body.
    expect(status.parentElement).toHaveFocus();
    expect(fakeState().catalog.invitations()).toEqual([{ customerId: LUNA_ID, email: "sofia@atelier.example", role: "owner" }]);
  });

  it("says Sending… while it sends again, and shows a second refusal again", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post(`${FAKE_API_URL}/customers/:id/invitations`, async () => {
        await held;
        return HttpResponse.json(invitation("failed"), { status: 201 });
      }),
    );
    leaveArrivalNote(`/customers/${LUNA_ID}`, { created: { invitation: invitation("failed") } });
    open(LUNA_ID);
    const status = await createdStatus();
    expect(status).toHaveTextContent("The invitation to sofia@atelier.example couldn't be sent.");

    await userEvent.click(screen.getByRole("button", { name: "Send again" }));
    const sending = await screen.findByRole("button", { name: "Sending…" });
    expect(sending).toBeDisabled();
    expect(sending).toHaveAttribute("aria-busy", "true");

    release();
    expect(await screen.findByRole("button", { name: "Send again" })).toBeEnabled();
    expect(status).toHaveTextContent("The invitation to sofia@atelier.example couldn't be sent.");
  });

  it("says when Send again got no answer while offline, and keeps the button", async () => {
    server.use(http.post(`${FAKE_API_URL}/customers/:id/invitations`, () => HttpResponse.error(), { once: true }));
    leaveArrivalNote(`/customers/${LUNA_ID}`, { created: { invitation: invitation("failed") } });
    open(LUNA_ID);
    await createdStatus();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await userEvent.click(screen.getByRole("button", { name: "Send again" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You're offline. Check your connection and try again.");
    expect(screen.getByRole("button", { name: "Send again" })).toBeEnabled();
  });

  it("offers no New order on a disabled customer, and says why", async () => {
    open(OLD_WORKS_ID);
    const head = await header("Old Works");
    expect(within(head).getByText("Disabled")).toBeInTheDocument();
    expect(within(head).queryByRole("link", { name: "New order" })).not.toBeInTheDocument();
    expect(within(head).getByText("New orders aren't offered while Old Works is disabled. Its orders and details stay below.")).toBeInTheDocument();
  });

  it("offers no New order to someone who can't place orders", async () => {
    open(LUNA_ID, SALES_LEAD);
    await screen.findByRole("heading", { level: 1, name: "Luna Jewels" });
    expect(screen.queryByRole("link", { name: "New order" })).not.toBeInTheDocument();
  });

  it("is not found without customer.read", async () => {
    open(LUNA_ID, CLERK);
    await waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });
});
