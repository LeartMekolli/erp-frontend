import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";
import { useCustomerProducts } from "@/lib/new-order/queries";

import { CAST_RING_ID, GIFT_SET_ID } from "../../../test/fake-erp-api/catalog";
import { FAKE_API_URL, LUNA_ID, ORDER_TAKER } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { setWide } from "../../../test/media";
import { server } from "../../../test/msw";
import { WithMe, renderAs } from "../../../test/render";
import { settle, until } from "../../../test/wait";

import { NewOrderPage } from "./new-order-page";
import { OrderTicket } from "./order-ticket";
import { ProductSection } from "./product-section";
import { useCheckout } from "./use-checkout";
import { usePlace } from "./use-place";
import { usePrice, useQuoteBody } from "./use-price";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => "/orders/new",
  notFound: navigation.notFound,
}));

const NOW = Date.parse("2026-11-16T10:00:00Z");
/** How long the fake holds a quote's price (erp-api's default hold). */
const HOLD_MS = 48 * 3_600_000;

/** A Cast ring for Luna in Silver 925, polished, scale 1, two of them, at the Standard speed. */
const CAST_RING: Partial<NewOrderValues> = {
  customerId: LUNA_ID,
  productId: CAST_RING_ID,
  options: { metal: "silver_925", finish: "polished" },
  size: "1",
  quantity: "2",
  speed: "standard",
};

/** A Gift set for Luna: no options, no size, no model. €24.00 each. */
const GIFT_SET: Partial<NewOrderValues> = { customerId: LUNA_ID, productId: GIFT_SET_ID, quantity: "1", speed: "standard" };

const NO_FILE = { held: null, measures: [] };

/** Freezes the clock and starts the fake over on it, so the fake's hold and AMI's clock agree. */
function freezeAt(now: number, toFake: ("Date" | "setInterval" | "clearInterval")[] = ["Date"]) {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake, now });
  resetFakeState();
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

/**
 * A model of Luna's, uploaded and measured in the fake as `useUpload` would leave it, so the quote
 * checks a real version: Luna's own, measured.
 */
function measuredModel(): string {
  const state = fakeState();
  const started = state.startFile(
    { kind: "design", name: "ring.stl", content_type: "model/stl", size: 10, declared_unit: "mm", customer_id: LUNA_ID },
    { origin: FAKE_API_URL },
  );
  state.storeObject(started.file.id, started.version.id, { contentType: "model/stl", size: 10 });
  state.completeFile(started.file.id, started.version.id);
  // Each read moves measuring on one step: uploaded → measuring → measured.
  state.getFile(started.file.id);
  state.getFile(started.file.id);
  return started.version.id;
}

/**
 * The page's wiring of the product fields, the checkout and the ticket, with the form starting from
 * `values`. A `versionId` stands for a held model, measured for Luna.
 */
function Harness({ values, versionId }: { values: Partial<NewOrderValues>; versionId?: string }) {
  const form = useForm<NewOrderValues>({ defaultValues: { ...EMPTY_VALUES, ...values } });
  const body = useQuoteBody(form.control, versionId);
  const price = usePrice(body);
  const placing = usePlace({ form, price, quoteKey: null, onPlaced: () => {} });
  const productId = useWatch({ control: form.control, name: "productId" });
  const product = useCustomerProducts(values.customerId ?? null).data?.find((candidate) => candidate.id === productId);
  const modelReady = versionId !== undefined;
  const checkout = useCheckout({ form, price, placing, model: { held: modelReady, ready: modelReady }, product });
  return (
    <FormProvider {...form}>
      <ProductSection refusals={price.fieldRefusals} />
      <OrderTicket checkout={checkout} price={price} placing={placing} model={NO_FILE} />
    </FormProvider>
  );
}

function renderHarness(values: Partial<NewOrderValues>, versionId?: string) {
  return renderAs(
    ORDER_TAKER,
    <WithMe>
      <Harness values={values} versionId={versionId} />
    </WithMe>,
  );
}

/** Get price, once the body is ready to be priced. */
async function getPriceButton() {
  const button = await screen.findByRole("button", { name: "Get price" });
  await until(() => expect(button).toHaveAttribute("aria-disabled", "false"));
  return button;
}

/** Each line of the shown price, as its label and amount. */
function priceRows(): string[][] {
  return Array.from(document.querySelectorAll("dl > div")).map((row) => [
    row.querySelector("dt")?.textContent ?? "",
    row.querySelector("dd")?.textContent ?? "",
  ]);
}

async function pickCustomer(search: string, name: string) {
  const box = await screen.findByRole("combobox", { name: "Customer" });
  await userEvent.clear(box);
  await userEvent.type(box, search);
  await userEvent.click(await screen.findByRole("option", { name }));
}

async function chooseProduct(name: string) {
  const product = await screen.findByRole("combobox", { name: "Product" });
  await waitFor(() => expect(product).toBeEnabled());
  await userEvent.selectOptions(product, name);
}

/** The one main button, whatever it reads now. */
const mainButton = () => screen.getByRole("button", { name: /^(Get price|Get new price|Getting a price…|Place order|Placing…)$/ });

/** On the whole page: Luna's Gift set priced at €24.00, to go by Courier to the saved address. */
async function readyToPlace() {
  renderAs(ORDER_TAKER, <NewOrderPage />);
  await pickCustomer("Luna", "Luna Jewels");
  await chooseProduct("Gift set");
  const main = await getPriceButton();
  await userEvent.click(main);
  expect(await screen.findByText("Unit price")).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Place order" })).toHaveAttribute("aria-disabled", "false"));
}

/** ⌘Enter as user-event types it. */
const COMMAND_ENTER = "{Meta>}{Enter}{/Meta}";

let quotes = 0;
let orders = 0;
beforeEach(() => {
  quotes = 0;
  orders = 0;
  navigation.push.mockReset();
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "POST") return;
    const path = new URL(request.url).pathname;
    if (path === "/pricing/quotes") quotes += 1;
    if (path === "/orders") orders += 1;
  });
  setWide(true);
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setOnline(true);
});

describe("OrderTicket", () => {
  it("shows the price lines for Cast ring", async () => {
    freezeAt(NOW);
    const model = measuredModel();
    renderHarness(CAST_RING, model);

    // Who and what, as soon as they are chosen.
    expect(await screen.findByText("2 × Cast ring")).toBeInTheDocument();
    expect(await screen.findByText("Silver 925 · Polished · Size 1 · Standard")).toBeInTheDocument();
    expect(screen.getByText("No price yet")).toBeInTheDocument();

    await userEvent.click(await getPriceButton());

    expect(await screen.findByText("Price holds until 18 Nov 2026, 10:00")).toBeInTheDocument();
    expect(priceRows()).toEqual([
      ["Material", "€40.00"],
      ["Making", "€25.00"],
      ["Finishing", "€10.00"],
      ["Unit price", "€75.00"],
      ["2 × €75.00", "€150.00"],
    ]);
    // No shipping method yet: the total is the quote's, before shipping and tax.
    expect(screen.getByText("Before shipping and tax")).toBeInTheDocument();
    expect(screen.getByText("€150.00", { selector: ".text-display" })).toBeInTheDocument();
    expect(screen.queryByText("No price yet")).not.toBeInTheDocument();
    expect(quotes).toBe(1);
  });

  it("announces only the price, not the button or the notes", async () => {
    renderHarness(GIFT_SET);
    const button = await getPriceButton();
    await userEvent.click(button);
    await screen.findByText("Unit price");

    const live = document.querySelector<HTMLElement>("[aria-live]");
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveAttribute("aria-busy", "false");
    expect(within(live!).getByText("Unit price")).toBeInTheDocument();
    expect(within(live!).getByText(/^Price holds until/)).toBeInTheDocument();
    expect(live).not.toContainElement(button);

    act(() => setOnline(false));
    expect(live).not.toContainElement(screen.getByText("You're offline."));
    // Nothing else on the page is a live region.
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it("shows one main button that turns from Get price to Place order", async () => {
    renderAs(ORDER_TAKER, <NewOrderPage />);
    await screen.findByRole("heading", { level: 1, name: "New order" });
    const main = mainButton();
    expect(main).toHaveTextContent("Get price");
    expect(main).toHaveAttribute("aria-disabled", "true");
    expect(main).toHaveAccessibleDescription("Pick the customer first.");

    await pickCustomer("Luna", "Luna Jewels");
    await waitFor(() => expect(main).toHaveAccessibleDescription("Pick a product."));
    await chooseProduct("Gift set");
    await until(() => expect(main).toHaveAttribute("aria-disabled", "false"));
    expect(main).toHaveAccessibleDescription("");

    await userEvent.click(main);
    // The same button now places: one main button, never two.
    await waitFor(() => expect(main).toHaveTextContent("Place order"));
    expect(screen.queryByRole("button", { name: "Get price" })).not.toBeInTheDocument();
    expect(main).toHaveAttribute("aria-disabled", "true");
    expect(main).toHaveAccessibleDescription("Pick a shipping method.");

    await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
    expect(main).toHaveAttribute("aria-disabled", "false");
    expect(main).toHaveAccessibleDescription("");
    expect(screen.getByText("Total before tax")).toBeInTheDocument();
    expect(screen.getByText("€36.00")).toBeInTheDocument();
  });

  it("keeps a stale price struck through with Get new price", async () => {
    renderHarness(GIFT_SET);
    await userEvent.click(await getPriceButton());
    expect(await screen.findByText("Unit price")).toBeInTheDocument();

    const quantity = screen.getByRole("textbox", { name: "Quantity" });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "3");

    // The lines go; the old total stays, struck through, with what to do about it.
    expect(screen.queryByText("Unit price")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Price holds until/)).not.toBeInTheDocument();
    expect(screen.getByText("€24.00")).toHaveClass("line-through");
    expect(screen.getByText("Changed: get a new price")).toBeInTheDocument();
    const main = screen.getByRole("button", { name: "Get new price" });
    expect(main).toHaveAttribute("aria-disabled", "false");

    // A new price for three, then another speed makes that one stale too.
    await userEvent.click(main);
    expect(await screen.findByText("3 × €24.00")).toBeInTheDocument();
    expect(screen.queryByText("Changed: get a new price")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Speed" }), "Express · 2 working days");
    expect(screen.queryByText("3 × €24.00")).not.toBeInTheDocument();
    expect(screen.getByText("€72.00")).toHaveClass("line-through");
    expect(screen.getByRole("button", { name: "Get new price" })).toHaveAttribute("aria-disabled", "false");
    expect(quotes).toBe(2);
  });

  it("lists refusals and marks the size", async () => {
    // erp-api's rules can refuse a size the product's range allows, such as a smaller range for one metal.
    server.use(
      http.post(`${FAKE_API_URL}/pricing/quotes`, () =>
        HttpResponse.json(
          {
            accepted: false,
            reasons: [
              { code: "size_out_of_range", message: "Silver 925 casts from scale 1.5" },
              { code: "price_missing", message: "Cast ring has no price for this size yet" },
            ],
          },
          { status: 200 },
        ),
      ),
    );
    renderHarness(CAST_RING, measuredModel());
    await userEvent.click(await getPriceButton());

    const refused = await screen.findByRole("group", { name: "This can't be priced:" });
    await waitFor(() => expect(refused).toHaveFocus());
    expect(within(refused).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Silver 925 casts from scale 1.5",
      "Cast ring has no price for this size yet",
    ]);

    const size = screen.getByRole("textbox", { name: "Size" });
    expect(size).toHaveAttribute("aria-invalid", "true");
    expect(size).toHaveAccessibleDescription(/Silver 925 casts from scale 1\.5/);
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText("Unit price")).not.toBeInTheDocument();

    // Another size is another configuration: the refusals go with the old one.
    await userEvent.clear(size);
    await userEvent.type(size, "2");
    expect(screen.queryByRole("group", { name: "This can't be priced:" })).not.toBeInTheDocument();
    expect(size).toHaveAttribute("aria-invalid", "false");
  });

  it("says when the price has expired", async () => {
    // useNow ticks on setInterval; setTimeout stays real, so Testing Library's waits still run.
    freezeAt(NOW, ["Date", "setInterval", "clearInterval"]);
    renderHarness(GIFT_SET);
    await userEvent.click(await getPriceButton());
    // `findBy` re-checks on setInterval, which is faked here; `until` waits on real setTimeout.
    await until(() => expect(screen.getByText("Price holds until 18 Nov 2026, 10:00")).toBeInTheDocument());

    act(() => vi.advanceTimersByTime(HOLD_MS + 30_000));

    expect(screen.getByText("Price expired. Placing gets a new price.")).toBeInTheDocument();
    expect(screen.queryByText(/^Price holds until/)).not.toBeInTheDocument();
    // The price itself stays, so staff can still place the order.
    expect(screen.getByText("Unit price")).toBeInTheDocument();
  });

  it("says you're offline", async () => {
    renderHarness(GIFT_SET);
    const button = await getPriceButton();

    act(() => setOnline(false));

    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("You're offline.");
    await userEvent.click(button);
    expect(quotes).toBe(0);
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveValue("1");

    act(() => setOnline(true));
    expect(screen.queryByText("You're offline.")).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(await screen.findByText("Unit price")).toBeInTheDocument();
  });

  it("shows erp-api's detail when the quote is turned away", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/pricing/quotes`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Not Found", status: 404, detail: "File not found" },
          { status: 404, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderHarness(CAST_RING, measuredModel());
    await userEvent.click(await getPriceButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("File not found");
    expect(screen.getByRole("textbox", { name: "Size" })).toHaveValue("1");
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveValue("2");
    expect(screen.getByRole("radio", { name: "Silver 925" })).toBeChecked();
  });

  it("keeps everything entered when no answer comes", async () => {
    server.use(http.post(`${FAKE_API_URL}/pricing/quotes`, () => HttpResponse.error(), { once: true }));
    renderHarness(GIFT_SET);
    const button = await getPriceButton();
    await userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("AMI can't reach the server right now. Try again in a moment.");
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveValue("1");

    // Pressed again, the same body is priced.
    await until(() => expect(button).toHaveAttribute("aria-disabled", "false"));
    await userEvent.click(button);
    expect(await screen.findByText("Unit price")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says Luna pays first", async () => {
    renderHarness(GIFT_SET);
    expect(await screen.findByText("Pays first. The order waits for Luna Jewels's payment before production starts.")).toBeInTheDocument();
    expect(screen.getByText("Luna Jewels")).toBeInTheDocument();
    expect(await screen.findByText("1 × Gift set")).toBeInTheDocument();
  });

  it("shows the new price after price_changed", async () => {
    await readyToPlace();
    // The hold runs out: placing prices the quote again, at the total × 1.1.
    fakeState().quotes.expireQuotes();
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    const notice = await screen.findByText("The price changed since it was quoted. Check the new price, then place the order.");
    await waitFor(() => expect(notice.parentElement).toHaveFocus());
    // The unit price and the line's total; the total with Courier is €26.40 + €12.00.
    expect(screen.getAllByText("€26.40")).toHaveLength(2);
    expect(screen.getByText("€38.40")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();

    // Placing again sends the new quote, so with a new key.
    const place = screen.getByRole("button", { name: "Place order" });
    await waitFor(() => expect(place).toHaveAttribute("aria-disabled", "false"));
    await userEvent.click(place);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    expect(orders).toBe(2);
    const order = fakeState().orders.all().find((candidate) => navigation.push.mock.calls[0]?.[0] === `/orders/${candidate.id}?placed=1`);
    expect(order?.total).toBe("38.40");
  });
});

describe("⌘Enter", () => {
  it("⌘Enter gets a new price after a change", async () => {
    await readyToPlace();
    expect(quotes).toBe(1);

    const quantity = screen.getByRole("textbox", { name: "Quantity" });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "2");
    expect(mainButton()).toHaveTextContent("Get new price");

    // Pressed from the quantity field, it asks for a price for two, never places the one for one.
    await userEvent.keyboard(COMMAND_ENTER);
    expect(await screen.findByText("2 × €24.00")).toBeInTheDocument();
    expect(quotes).toBe(2);
    expect(orders).toBe(0);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(mainButton()).toHaveTextContent("Place order");
  });

  it("⌘Enter places once priced", async () => {
    await readyToPlace();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    expect(orders).toBe(1);
  });

  it("⌘Enter does nothing while a dialog is open", async () => {
    await readyToPlace();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave this order?" });
    // Focus on the dialog itself, so the Enter can't press one of its buttons either.
    act(() => dialog.focus());

    await userEvent.keyboard(COMMAND_ENTER);
    await settle();
    expect(orders).toBe(0);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Leave this order?" })).toBeInTheDocument();

    // Once it is closed, the shortcut works again.
    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.keyboard(COMMAND_ENTER);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    expect(orders).toBe(1);
  });

  it("⌘Enter does nothing while the change-customer dialog is open", async () => {
    await readyToPlace();
    await userEvent.click(screen.getByRole("button", { name: "Change the customer" }));
    await pickCustomer("Mira", "Mira Studio");
    const dialog = await screen.findByRole("dialog", { name: "Change the customer?" });
    act(() => dialog.focus());
    const quotesBefore = quotes;

    await userEvent.keyboard(COMMAND_ENTER);
    await settle();
    expect(quotes).toBe(quotesBefore);
    expect(orders).toBe(0);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Change the customer?" })).toBeInTheDocument();
  });
});

describe("narrow", () => {
  beforeEach(() => setWide(false));

  it("shows the dock and opens details when narrow", async () => {
    renderAs(ORDER_TAKER, <NewOrderPage />);
    await pickCustomer("Luna", "Luna Jewels");
    await chooseProduct("Gift set");

    // No ticket beside the form: a bar at the bottom with no price yet, See details and the main button.
    expect(screen.queryByRole("complementary", { name: "Order" })).not.toBeInTheDocument();
    expect(screen.getByText("No price yet")).toBeInTheDocument();
    const main = await getPriceButton();
    await userEvent.click(main);

    expect(await screen.findByText("€24.00")).toBeInTheDocument();
    expect(screen.getByText("Before shipping and tax")).toBeInTheDocument();
    expect(screen.getByText(/^Price holds until/)).toBeInTheDocument();
    // The lines are in the details, not the bar.
    expect(screen.queryByText("Unit price")).not.toBeInTheDocument();
    expect(main).toHaveTextContent("Place order");

    await userEvent.click(screen.getByRole("button", { name: "See details" }));
    const sheet = await screen.findByRole("dialog", { name: "Order" });
    expect(sheet).toHaveAttribute("data-ticket");
    expect(within(sheet).getByText("Unit price")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Place order" })).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Unit price")).not.toBeInTheDocument();
  });

  it("opens the sheet and focuses the refusals when narrow", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/pricing/quotes`, () =>
        HttpResponse.json({ accepted: false, reasons: [{ code: "price_missing", message: "Gift set has no price yet" }] }, { status: 200 }),
      ),
    );
    renderAs(ORDER_TAKER, <NewOrderPage />);
    await pickCustomer("Luna", "Luna Jewels");
    await chooseProduct("Gift set");
    await userEvent.click(await getPriceButton());

    // The sheet opens by itself, so the refusals are in view and take focus.
    const sheet = await screen.findByRole("dialog", { name: "Order" });
    const refused = within(sheet).getByRole("group", { name: "This can't be priced:" });
    expect(refused).toHaveTextContent("Gift set has no price yet");
    await waitFor(() => expect(refused).toHaveFocus());
  });

  it("puts focus on the dock's main button when an opened sheet closes", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/pricing/quotes`, () =>
        HttpResponse.json({ accepted: false, reasons: [{ code: "price_missing", message: "Gift set has no price yet" }] }, { status: 200 }),
      ),
    );
    renderAs(ORDER_TAKER, <NewOrderPage />);
    await pickCustomer("Luna", "Luna Jewels");
    await chooseProduct("Gift set");
    await userEvent.click(await getPriceButton());
    const sheet = await screen.findByRole("dialog", { name: "Order" });
    await waitFor(() => expect(within(sheet).getByRole("group", { name: "This can't be priced:" })).toHaveFocus());

    // The refusals that had focus go with the sheet: focus comes back to the bar, not the page's body.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Get price" })).toHaveFocus();
  });

  it("opens the sheet and focuses the changed notice when narrow", async () => {
    await readyToPlaceNarrow();
    // The hold runs out: placing prices the quote again, at the total × 1.1.
    fakeState().quotes.expireQuotes();
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    const sheet = await screen.findByRole("dialog", { name: "Order" });
    const notice = within(sheet).getByText("The price changed since it was quoted. Check the new price, then place the order.");
    await waitFor(() => expect(notice.parentElement).toHaveFocus());
    expect(within(sheet).getByText("€38.40")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("opens the sheet and focuses the Place failure when narrow", async () => {
    server.use(
      http.post(`${FAKE_API_URL}/orders`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "A quote is ordered once" },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    await readyToPlaceNarrow();
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    const sheet = await screen.findByRole("dialog", { name: "Order" });
    const failure = await within(sheet).findByRole("alert");
    expect(failure).toHaveTextContent("A quote is ordered once");
    await waitFor(() => expect(failure).toHaveFocus());
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

/** Below 1280px: Luna's Gift set priced at €24.00 in the bar, to go by Courier to the saved address. */
async function readyToPlaceNarrow() {
  renderAs(ORDER_TAKER, <NewOrderPage />);
  await pickCustomer("Luna", "Luna Jewels");
  await chooseProduct("Gift set");
  await userEvent.click(await getPriceButton());
  expect(await screen.findByText("€24.00")).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("radio", { name: "Courier · €12.00" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Place order" })).toHaveAttribute("aria-disabled", "false"));
}
