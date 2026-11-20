/* eslint-disable @next/next/no-html-link-for-pages -- the plain links here stand in for any same-site link,
   which is what the leave guard listens for; next/link would route through the mocked router instead. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_API_URL, LUNA_ID, MIRA_ID, ORDER_TAKER, ORDER_WRITER, STAFF } from "../../../test/fake-erp-api/seed";
import { fakeState } from "../../../test/fake-erp-api/state";
import { setWide } from "../../../test/media";
import { server } from "../../../test/msw";
import { renderAs } from "../../../test/render";

import { LeaveDialog } from "./leave-dialog";
import { NewOrderPage } from "./new-order-page";
import { useLeaveGuard } from "./use-leave-guard";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => "/orders/new",
  notFound: navigation.notFound,
}));

/** What reached the document after the leave guard: a click it let through shows up here, unprevented. */
let reached: boolean[] = [];
function recordClick(event: MouseEvent) {
  reached.push(event.defaultPrevented);
  // jsdom can't navigate.
  event.preventDefault();
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.notFound.mockReset();
  reached = [];
  document.addEventListener("click", recordClick);
  // The ticket beside the form; the narrow bar and sheet are tested in `order-ticket.test.tsx`.
  setWide(true);
});

afterEach(() => {
  document.removeEventListener("click", recordClick);
  server.events.removeAllListeners();
  vi.unstubAllGlobals();
});

/** Every request that goes out from now on, with its body as text. */
function recordRequests() {
  const requests: { method: string; url: string; key: string | null; body: Promise<string> }[] = [];
  server.events.on("request:start", ({ request }) => {
    requests.push({ method: request.method, url: request.url, key: request.headers.get("idempotency-key"), body: request.clone().text() });
  });
  return requests;
}

/** The bodies of the POSTs to `path` among `requests`, read as JSON. */
async function postedTo(requests: ReturnType<typeof recordRequests>, path: string): Promise<unknown[]> {
  const posts = requests.filter((request) => request.method === "POST" && new URL(request.url).pathname === path);
  return Promise.all(posts.map(async (post) => JSON.parse(await post.body) as unknown));
}

async function pickCustomer(search: string, name: string) {
  const box = await screen.findByRole("combobox", { name: "Customer" });
  await userEvent.clear(box);
  await userEvent.type(box, search);
  await userEvent.click(await screen.findByRole("option", { name }));
}

/** Changes the picked customer through the chip's Change, saying yes when asked to clear the order. */
async function changeCustomer(search: string, name: string) {
  await userEvent.click(screen.getByRole("button", { name: "Change the customer" }));
  await pickCustomer(search, name);
  await userEvent.click(await screen.findByRole("button", { name: "Change customer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

async function chooseProduct(name: string) {
  const product = await screen.findByRole("combobox", { name: "Product" });
  await waitFor(() => expect(product).toBeEnabled());
  await userEvent.selectOptions(product, name);
}

/** Presses the main button while it asks for a price; after a change it reads Get new price. */
async function getPrice() {
  const button = screen.getByRole("button", { name: /^Get (new )?price$/ });
  await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "false"));
  await userEvent.click(button);
  expect(await screen.findByText("Unit price")).toBeInTheDocument();
}

/** Luna's Gift set priced at €24.00, to go by Courier to the saved address. */
async function readyToPlace() {
  // Choosing a radio is a click the recorder would cancel, and with it the choice.
  document.removeEventListener("click", recordClick);
  renderAs(ORDER_TAKER, <NewOrderPage />);
  await pickCustomer("Luna", "Luna Jewels");
  await chooseProduct("Gift set");
  await getPrice();
  await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
  expect(screen.getByText("€36.00")).toBeInTheDocument();
}

const placeButton = () => screen.getByRole("button", { name: "Place order" });

describe("NewOrderPage", () => {
  it("is not found without quote.create", async () => {
    renderAs(ORDER_WRITER, <NewOrderPage />);
    await vi.waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  });

  it("shows the model and customer panels, and delivery once a customer is picked", async () => {
    renderAs(ORDER_TAKER, <NewOrderPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "New order" })).toBeInTheDocument();
    const titles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(titles()).toEqual(["Model"]);
    expect(screen.getByRole("region", { name: "Model" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Customer" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Order" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Delivery" })).not.toBeInTheDocument();
    expect(navigation.notFound).not.toHaveBeenCalled();

    await pickCustomer("Luna", "Luna Jewels");
    expect(await screen.findByRole("heading", { level: 2, name: "Delivery" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Delivery" })).toBeInTheDocument();
    expect(titles()).toEqual(["Model", "Delivery"]);
  });

  it("shows delivery before any price", async () => {
    document.removeEventListener("click", recordClick);
    renderAs(ORDER_TAKER, <NewOrderPage />);
    await pickCustomer("Luna", "Luna Jewels");
    // No product yet, so no price: the address and the methods are there already.
    const delivery = await screen.findByRole("region", { name: "Delivery" });
    expect(await within(delivery).findByText("12 rue des Orfèvres, 69002 Lyon, FR")).toBeInTheDocument();
    await userEvent.click(await within(delivery).findByRole("radio", { name: "Courier · €12.00" }));
    expect(screen.getByText("No price yet")).toBeInTheDocument();
  });

  it("keeps delivery open after a change", async () => {
    await readyToPlace();
    await userEvent.type(screen.getByRole("textbox", { name: "Note" }), "Leave it at reception.");

    // Another quantity makes the price stale; what was entered in Delivery stays, in view.
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("button", { name: "Get new price" })).toBeInTheDocument();
    const delivery = screen.getByRole("region", { name: "Delivery" });
    expect(within(delivery).getByRole("radio", { name: "Courier · €12.00" })).toBeChecked();
    expect(within(delivery).getByRole("textbox", { name: "Note" })).toHaveValue("Leave it at reception.");
    expect(within(delivery).getByRole("group", { name: "Ship to (saved address)" })).toBeInTheDocument();
  });

  it("has no section numbers", async () => {
    renderAs(ORDER_TAKER, <NewOrderPage />);
    await screen.findByRole("heading", { level: 1, name: "New order" });
    await pickCustomer("Luna", "Luna Jewels");
    await screen.findByRole("heading", { level: 2, name: "Delivery" });
    for (const heading of screen.getAllByRole("heading")) {
      expect(heading.textContent).not.toMatch(/^[1-4]$/);
    }
  });

  it("takes a model for any product, and says a ready-made one doesn't use it", async () => {
    document.removeEventListener("click", recordClick);
    renderAs(STAFF, <NewOrderPage />);
    // The model comes first: the drop zone is there before a customer or product.
    expect(await screen.findByLabelText("Upload a model")).toBeInTheDocument();
    expect(screen.queryByText("This product doesn't use a model.")).not.toBeInTheDocument();
    await pickCustomer("Luna", "Luna Jewels");
    await chooseProduct("Nameplate");
    expect(await screen.findByText("This product doesn't use a model.")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload a model")).toBeInTheDocument();

    await chooseProduct("Cast ring");
    await waitFor(() => expect(screen.queryByText("This product doesn't use a model.")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Upload a model")).toBeInTheDocument();
  });

  it("moves focus to the product select when a customer is picked", async () => {
    document.removeEventListener("click", recordClick);
    renderAs(ORDER_TAKER, <NewOrderPage />);
    await pickCustomer("Luna", "Luna Jewels");
    const product = await screen.findByRole("combobox", { name: "Product" });
    await waitFor(() => expect(product).toHaveFocus());
  });

  it("leaves at once when nothing is entered", async () => {
    renderAs(
      ORDER_TAKER,
      <>
        <a href="/orders">Another page</a>
        <NewOrderPage />
      </>,
    );
    await screen.findByRole("heading", { level: 1, name: "New order" });
    await userEvent.click(screen.getByRole("link", { name: "Another page" }));
    // The click went through unprevented and no question was asked.
    expect(reached).toEqual([false]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(navigation.push).toHaveBeenCalledWith("/orders");
  });

  it("has a back link to Orders that asks before leaving", async () => {
    renderAs(ORDER_TAKER, <NewOrderPage />);
    const back = await screen.findByRole("link", { name: "Orders" });
    expect(back).toHaveAttribute("href", "/orders");
    await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), "Luna");
    await userEvent.click(await screen.findByRole("option", { name: "Luna Jewels" }));
    // The customer is set once loaded, which also opens the product select.
    await screen.findByText("Trade · Free");

    // Only the link's click counts; picking the customer clicked too.
    reached = [];
    await userEvent.click(back);
    expect(await screen.findByRole("dialog", { name: "Leave this order?" })).toBeInTheDocument();
    expect(reached).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "New order" })).toBeInTheDocument();
    expect(screen.getByText("Trade · Free")).toBeInTheDocument();
  });

  it(
    "a second upload hides the price",
    async () => {
      // Through the real upload and the fake's storage and measuring: the version id is what changes
      // the body. The recorder prevents every click, which would stop user-event opening the file picker.
      document.removeEventListener("click", recordClick);
      const stl = () => new File(["solid ring"], "ring.stl", { type: "model/stl" });
      renderAs(STAFF, <NewOrderPage />);
      await userEvent.type(await screen.findByRole("combobox", { name: "Customer" }), "Luna");
      await userEvent.click(await screen.findByRole("option", { name: "Luna Jewels" }));
      const product = await screen.findByRole("combobox", { name: "Product" });
      await waitFor(() => expect(product).toBeEnabled());
      await userEvent.selectOptions(product, "Cast ring");
      await userEvent.type(await screen.findByRole("textbox", { name: "Size" }), "1");

      await userEvent.upload(screen.getByLabelText("Upload a model"), stl());
      expect(await screen.findByText("Ready", {}, { timeout: 4_000 })).toBeInTheDocument();
      const getPrice = screen.getByRole("button", { name: "Get price" });
      await waitFor(() => expect(getPrice).toHaveAttribute("aria-disabled", "false"));
      await userEvent.click(getPrice);
      expect(await screen.findByText("Unit price")).toBeInTheDocument();

      await userEvent.upload(screen.getByLabelText("Replace file"), stl());
      expect(screen.queryByText("Unit price")).not.toBeInTheDocument();
      expect(getPrice).toHaveAttribute("aria-disabled", "true");

      // Measured, the new model is another body: the old price stays gone until staff ask again.
      expect(await screen.findByText("Ready", {}, { timeout: 4_000 })).toBeInTheDocument();
      expect(screen.queryByText("Unit price")).not.toBeInTheDocument();
      await waitFor(() => expect(getPrice).toHaveAttribute("aria-disabled", "false"));
    },
    15_000,
  );

  it("keeps focus on the main button when the price arrives", async () => {
    document.removeEventListener("click", recordClick);
    renderAs(ORDER_TAKER, <NewOrderPage />);
    await pickCustomer("Luna", "Luna Jewels");
    await chooseProduct("Gift set");
    const main = screen.getByRole("button", { name: "Get price" });
    await getPrice();
    // The same button now places, and keeps focus; it is off until a shipping method is picked.
    expect(placeButton()).toBe(main);
    expect(main).toHaveFocus();
    expect(main).toHaveAttribute("aria-disabled", "true");
  });

  it("opens the new order saying it was placed", async () => {
    await readyToPlace();
    const before = new Set(fakeState().orders.all().map((order) => order.id));
    await userEvent.click(placeButton());

    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    const placed = fakeState().orders.all().filter((order) => !before.has(order.id));
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ customer: { id: LUNA_ID }, channel: "staff", state: "awaiting_payment", total: "36.00" });
    expect(navigation.push).toHaveBeenCalledWith(`/orders/${placed[0]!.id}?placed=1`);

    // The guard is off, though the form is still filled in: the order is placed, nothing is lost.
    const closing = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(false);
  });

  it("locks every field while placing, with focus staying on Place", async () => {
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
    await readyToPlace();
    // Picked, the customer is a chip whose one control is Change.
    const customer = screen.getByRole("button", { name: "Change the customer" });
    const quantity = screen.getByRole("textbox", { name: "Quantity" });
    const note = screen.getByRole("textbox", { name: "Note" });
    await userEvent.type(note, "Leave it at reception.");
    expect(customer).toBeEnabled();
    expect(quantity).toBeEnabled();

    const place = placeButton();
    await userEvent.click(place);

    await waitFor(() => expect(quantity).toBeDisabled());
    expect(customer).toBeDisabled();
    expect(note).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Product" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Courier · €12.00" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change address" })).toBeDisabled();
    // Place keeps focus and says nothing more; Cancel stays usable.
    expect(place).toHaveFocus();
    expect(place).toHaveTextContent("Placing…");
    expect(place).toHaveAccessibleDescription("");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();

    release();
    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("A quote is ordered once");
    await waitFor(() => expect(quantity).toBeEnabled());
    expect(customer).toBeEnabled();
    expect(note).toBeEnabled();
    expect(within(screen.getByRole("group", { name: "Customer" })).getByText("Luna Jewels")).toBeInTheDocument();
    expect(quantity).toHaveValue("1");
    expect(note).toHaveValue("Leave it at reception.");
    expect(screen.getByRole("radio", { name: "Courier · €12.00" })).toBeChecked();
    await waitFor(() => expect(message).toHaveFocus());
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("clears the price after another 409", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/orders`, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "A quote is ordered once",
            errors: [{ path: "lines.0", message: "this quote has already been ordered" }],
          },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    await readyToPlace();
    const place = placeButton();
    await userEvent.click(place);

    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("A quote is ordered once");
    await waitFor(() => expect(message).toHaveFocus());
    // The price is gone: the main button asks for a fresh one, with erp-api's reason under it.
    expect(screen.queryByText("Unit price")).not.toBeInTheDocument();
    expect(screen.getByText("No price yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Place order" })).not.toBeInTheDocument();
    expect(place).toHaveTextContent("Get price");
    expect(place).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("radio", { name: "Courier · €12.00" })).toBeChecked();

    await getPrice();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(placeButton()).toHaveAttribute("aria-disabled", "false");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it(
    "changing the customer clears every section",
    async () => {
      // The recorder would cancel the radio and the file picker's clicks.
      document.removeEventListener("click", recordClick);
      const requests = recordRequests();
      renderAs(STAFF, <NewOrderPage />);
      await pickCustomer("Luna", "Luna Jewels");
      await chooseProduct("Cast ring");
      await userEvent.type(await screen.findByRole("textbox", { name: "Size" }), "1");
      await userEvent.upload(screen.getByLabelText("Upload a model"), new File(["solid ring"], "ring.stl", { type: "model/stl" }));
      expect(await screen.findByText("Ready", {}, { timeout: 4_000 })).toBeInTheDocument();
      await getPrice();

      await userEvent.click(await screen.findByRole("button", { name: "Change address" }));
      const name = screen.getByRole("textbox", { name: "Name" });
      await userEvent.clear(name);
      await userEvent.type(name, "Luna Jewels Atelier");
      await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Note" }), "Ring sizes inside.");

      const [lunaQuote] = (await postedTo(requests, "/pricing/quotes")) as { file_version_id?: string }[];
      const lunaVersion = lunaQuote?.file_version_id;
      expect(lunaVersion).toBeTruthy();
      const switchedAt = requests.length;

      await changeCustomer("Mira", "Mira Studio");
      expect(await screen.findByText("No group · Starter")).toBeInTheDocument();
      const product = await screen.findByRole("combobox", { name: "Product" });
      expect(product).toHaveValue("");
      // Focus comes back to the product select for the new customer.
      await waitFor(() => expect(product).toHaveFocus());
      // Luna's price is gone, not kept struck through: Mira's order asks for its first price.
      expect(screen.getByRole("button", { name: "Get price" })).toHaveAttribute("aria-disabled", "true");
      expect(screen.queryByText("Changed: get a new price")).not.toBeInTheDocument();
      expect(screen.getByText("No price yet")).toBeInTheDocument();
      expect(screen.queryByText("Unit price")).not.toBeInTheDocument();

      // The same product again starts with no size; the model is held and was uploaded again for Mira,
      // so it is her version, not Luna's, that waits to be quoted.
      await chooseProduct("Cast ring");
      expect(await screen.findByRole("textbox", { name: "Size" })).toHaveValue("");
      // Measuring takes a few polls, a second apart at first.
      expect(await screen.findByText("Ready", {}, { timeout: 4_000 })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Get price" })).toHaveAttribute("aria-disabled", "true");

      // Priced for Mira, Delivery starts empty: her (missing) saved address, no method, no note.
      await chooseProduct("Gift set");
      await getPrice();
      expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("");
      expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("");
      expect(screen.queryByRole("radio", { checked: true, name: /Courier/ })).not.toBeInTheDocument();

      // Nothing sent since names Luna or her model.
      const later = requests.slice(switchedAt);
      expect(later.some((request) => request.method === "POST" && new URL(request.url).pathname === "/pricing/quotes")).toBe(true);
      for (const request of later) {
        const body = await request.body;
        expect(`${request.url} ${body}`).not.toContain(LUNA_ID);
        expect(body).not.toContain(lunaVersion!);
      }
    },
    15_000,
  );

  it(
    "keeps the model when the product changes",
    async () => {
      document.removeEventListener("click", recordClick);
      renderAs(STAFF, <NewOrderPage />);
      await pickCustomer("Luna", "Luna Jewels");
      await chooseProduct("Cast ring");
      await userEvent.upload(screen.getByLabelText("Upload a model"), new File(["solid ring"], "ring.stl", { type: "model/stl" }));
      // Measuring takes a few polls, a second apart at first.
      expect(await screen.findByText("Ready", {}, { timeout: 4_000 })).toBeInTheDocument();

      await chooseProduct("Gift set");
      await chooseProduct("Cast ring");
      expect(await screen.findByLabelText("Replace file")).toBeInTheDocument();
      expect(screen.getByText("Ready")).toBeInTheDocument();
    },
    15_000,
  );

  it(
    "changing the customer during an upload starts it again for the new customer",
    async () => {
      document.removeEventListener("click", recordClick);
      const requests = recordRequests();
      renderAs(STAFF, <NewOrderPage />);
      await pickCustomer("Luna", "Luna Jewels");
      await chooseProduct("Cast ring");
      await userEvent.type(await screen.findByRole("textbox", { name: "Size" }), "1");
      await userEvent.upload(screen.getByLabelText("Upload a model"), new File(["solid ring"], "ring.stl", { type: "model/stl" }));
      // Measuring takes a few polls, a second apart at first: the upload is still running here.
      expect(screen.queryByText("Ready")).not.toBeInTheDocument();

      await changeCustomer("Mira", "Mira Studio");
      expect(await screen.findByText("No group · Starter")).toBeInTheDocument();
      // The product resets with the customer; the model is held and goes up again for Mira.
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Product" })).toHaveValue(""));
      const switchedAt = requests.length;

      await chooseProduct("Cast ring");
      expect(await screen.findByRole("textbox", { name: "Size" })).toHaveValue("");
      // Measuring takes a few polls, a second apart at first.
      expect(await screen.findByText("Ready", {}, { timeout: 4_000 })).toBeInTheDocument();

      // Two uploads started, the second one for Mira.
      const started = (await postedTo(requests, "/files")) as { customer_id?: string }[];
      expect(started.map((body) => body.customer_id)).toEqual([LUNA_ID, MIRA_ID]);

      // Since the switch only Mira's file was read: nothing touched Luna's (complete, polling, URL).
      const fileIds = new Set(
        requests
          .slice(switchedAt)
          .map((request) => new URL(request.url).pathname.match(/^\/files\/([^/]+)/)?.[1])
          .filter((id) => id !== undefined),
      );
      expect(fileIds.size).toBe(1);
      for (const request of requests.slice(switchedAt)) {
        expect(`${request.url} ${await request.body}`).not.toContain(LUNA_ID);
      }
      expect(await postedTo(requests.slice(switchedAt), "/pricing/quotes")).toEqual([]);
    },
    15_000,
  );
});

function Harness({ dirty }: { dirty: boolean }) {
  const guard = useLeaveGuard(dirty);
  return (
    <>
      <a href="/orders">Orders</a>
      <a href="/orders" target="_blank" rel="noreferrer">
        Orders in a new tab
      </a>
      <a href="https://elsewhere.example.test/page">Elsewhere</a>
      <a href="/orders/new#top">Top</a>
      <button type="button" onClick={() => guard.requestLeave("/orders")}>
        Cancel
      </button>
      <LeaveDialog {...guard.dialog} />
    </>
  );
}

describe("useLeaveGuard", () => {
  it("asks before leaving with a customer picked", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    expect(await screen.findByRole("dialog", { name: "Leave this order?" })).toBeInTheDocument();
    expect(screen.getByText("What you've entered here will be lost.")).toBeInTheDocument();
    // The page's own links never saw the click.
    expect(reached).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigation.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    expect(navigation.push).toHaveBeenCalledWith("/orders");
    expect(navigation.push).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Stay is the main button", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave this order?" });
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Stay", "Leave"]);
    expect(buttons[0]).toHaveAttribute("data-variant", "primary");
    expect(buttons[1]).toHaveAttribute("data-variant", "outline");
  });

  it("sends Cancel through the same dialog", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("dialog", { name: "Leave this order?" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("lets modifier clicks, new tabs, other sites and the same page through", async () => {
    window.history.pushState({}, "", "/orders/new");
    render(<Harness dirty />);
    fireEvent.click(screen.getByRole("link", { name: "Orders" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Orders" }), { metaKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Orders in a new tab" }));
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    fireEvent.click(screen.getByRole("link", { name: "Top" }));
    expect(reached).toEqual([false, false, false, false, false]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks the browser before the tab closes only while dirty", () => {
    const closing = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const { rerender } = render(<Harness dirty={false} />);
    expect(closing()).toBe(false);
    rerender(<Harness dirty />);
    expect(closing()).toBe(true);
    rerender(<Harness dirty={false} />);
    expect(closing()).toBe(false);
  });
});
