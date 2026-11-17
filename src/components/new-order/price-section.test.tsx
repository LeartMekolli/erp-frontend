import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";
import { useUpload } from "@/lib/upload/use-upload";

import { CAST_RING_ID, GIFT_SET_ID } from "../../../test/fake-erp-api/catalog";
import { FAKE_API_URL, LUNA_ID, ORDER_TAKER } from "../../../test/fake-erp-api/seed";
import { fakeState, resetFakeState } from "../../../test/fake-erp-api/state";
import { server } from "../../../test/msw";
import { WithMe, renderAs } from "../../../test/render";
import { until } from "../../../test/wait";

import { PriceSection } from "./price-section";
import { ProductSection } from "./product-section";
import { usePrice, useQuoteBody } from "./use-price";

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

/** A Gift set for Luna: no options, no size, no model. */
const GIFT_SET: Partial<NewOrderValues> = { customerId: LUNA_ID, productId: GIFT_SET_ID, quantity: "1", speed: "standard" };

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

/** The page's wiring of sections 2 and 3, with the form starting from `values`. */
function Harness({ values, versionId }: { values: Partial<NewOrderValues>; versionId?: string }) {
  const form = useForm<NewOrderValues>({ defaultValues: { ...EMPTY_VALUES, ...values } });
  const upload = useUpload({ area: "staff", kind: "design", customerId: LUNA_ID });
  const price = usePrice(useQuoteBody(form.control, versionId));
  return (
    <FormProvider {...form}>
      <ProductSection refusals={price.fieldRefusals} upload={upload} />
      <PriceSection price={price} />
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

let quotes = 0;
beforeEach(() => {
  quotes = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname === "/pricing/quotes") quotes += 1;
  });
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
  setOnline(true);
});

describe("PriceSection", () => {
  it("shows the price lines for Cast ring", async () => {
    freezeAt(NOW);
    const model = measuredModel();
    renderHarness(CAST_RING, model);

    await userEvent.click(await getPriceButton());

    expect(await screen.findByText("Holds until 18 Nov 2026, 10:00")).toBeInTheDocument();
    expect(priceRows()).toEqual([
      ["Material", "€40.00"],
      ["Making", "€25.00"],
      ["Finishing", "€10.00"],
      ["Unit price", "€75.00"],
      ["2 ×", "€150.00"],
    ]);
    expect(quotes).toBe(1);
  });

  it("hides the price when the body changes", async () => {
    renderHarness(GIFT_SET);
    await userEvent.click(await getPriceButton());
    expect(await screen.findByText("Unit price")).toBeInTheDocument();

    const quantity = screen.getByRole("textbox", { name: "Quantity" });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "3");
    expect(screen.queryByText("Unit price")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Holds until/)).not.toBeInTheDocument();

    // A new price for three, then another speed hides that one too.
    await userEvent.click(await getPriceButton());
    expect(await screen.findByText("3 ×")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Express · 2 working days" }));
    expect(screen.queryByText("3 ×")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get price" })).toHaveAttribute("aria-disabled", "false");
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
    await until(() => expect(screen.getByText("Holds until 18 Nov 2026, 10:00")).toBeInTheDocument());

    act(() => vi.advanceTimersByTime(HOLD_MS + 30_000));

    expect(screen.getByText("Price expired. Placing gets a new price.")).toBeInTheDocument();
    expect(screen.queryByText(/^Holds until/)).not.toBeInTheDocument();
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
});
