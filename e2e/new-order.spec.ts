import type { Page } from "@playwright/test";

import { ORDER_TAKER, STAFF } from "../test/fake-erp-api/seed";

import { expect, expectNoAxeViolations, expectNoSideScroll, settled, signIn, test } from "./helpers";
import { chooseCourier, getPrice, isWide, openNewOrder, pickCustomer, pickProduct, priceNameplate, ticket } from "./new-order-steps";
import { FAKE_URL } from "./urls";

/** A one-facet ASCII STL. */
const RING_MODEL = "e2e/fixtures/ring.stl";

async function openAsStaff(page: Page, email = STAFF.email) {
  await signIn(page, email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
}

/** Luna's Cast ring at scale 1, the model dropped first and uploaded once Luna is picked, then measured. */
async function prepareRing(page: Page) {
  await openNewOrder(page);
  await page.getByLabel("Upload a model").setInputFiles(RING_MODEL);
  await expect(page.getByText("Uploads when you pick the customer.")).toBeVisible();
  await pickCustomer(page, "Luna Jewels");
  await pickProduct(page, "Cast ring");
  await page.getByRole("textbox", { name: "Size" }).fill("1");
  // The fake measures the file after about a second, and the page polls for it.
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Model" }).getByText("Volume", { exact: true })).toBeVisible();
}

/** The order page shows what was just placed: its heading and its state in the header. */
async function expectAwaitingPayment(page: Page) {
  // It says so once, at the plain address: the note that says so was used up, so a reload doesn't.
  await expect(page.getByRole("status").filter({ hasText: /^Order #\d+ placed\.$/ })).toBeVisible();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  const heading = page.getByRole("heading", { level: 1, name: /^#\d+$/ });
  await expect(heading).toBeVisible();
  // The state shares its line with what the order needs: "Awaiting payment · To collect".
  await expect(page.locator("header").filter({ has: heading }).getByText(/^Awaiting payment( · |$)/)).toBeVisible();
}

test("places a ready-made order", async ({ page }) => {
  await openAsStaff(page);
  await priceNameplate(page);
  await chooseCourier(page);
  await page.getByRole("button", { name: "Place order" }).click();
  await expectAwaitingPayment(page);
});

test("places with an uploaded model", async ({ page }) => {
  await openAsStaff(page);
  await prepareRing(page);
  await getPrice(page);
  await chooseCourier(page);
  await page.getByRole("button", { name: "Place order" }).click();
  await expectAwaitingPayment(page);
});

test("shows why it can't be priced", async ({ page }) => {
  await openAsStaff(page);
  await openNewOrder(page);
  await pickCustomer(page, "Luna Jewels");
  await pickProduct(page, "Cast ring");

  // Scale 5 is outside the ring's 0.5 to 3: the size says why, and there is nothing to ask erp-api.
  await page.getByRole("textbox", { name: "Size" }).fill("5");
  await expect(page.getByRole("textbox", { name: "Size" })).toHaveAccessibleDescription(/Enter a size between 0\.5 and 3\./);
  await expect(page.getByRole("button", { name: "Get price" })).toBeDisabled();

  // A configuration erp-api itself refuses: Brass left Raw. Its reason is listed under Price.
  await page.getByRole("textbox", { name: "Size" }).fill("1");
  await page.getByLabel("Upload a model").setInputFiles(RING_MODEL);
  // The fake measures the file after about a second, and the page polls for it.
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("radio", { name: "Brass" }).check();
  await page.getByRole("radio", { name: "Raw" }).check();
  await page.getByRole("button", { name: "Get price" }).click();
  // Below 1280px the sheet opens by itself, so the reasons are in view either way.
  await expect(page.getByRole("group", { name: "This can't be priced:" })).toContainText("Brass needs a finish: pick Polished");
  await expect(page.getByRole("group", { name: "This can't be priced:" })).toBeInViewport();
  // With no price there is nothing to place: the one main button asks for a price.
  await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(0);
});

test("changing quantity after a price keeps it struck through", async ({ page }) => {
  await openAsStaff(page);
  await priceNameplate(page);
  await chooseCourier(page);

  await page.getByRole("textbox", { name: "Quantity" }).fill("2");
  const order = ticket(page);
  await expect(order.getByText("Changed: get a new price")).toBeVisible();
  await expect(order.locator(".line-through")).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(0);

  await getPrice(page);
  await expect(order.getByText("Changed: get a new price")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled();
});

test("price changed at placing", async ({ page, request }) => {
  await openAsStaff(page);
  await priceNameplate(page);
  await chooseCourier(page);
  await request.post(`${FAKE_URL}/__expire-quotes`);

  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("The price changed since it was quoted. Check the new price, then place the order.")).toBeVisible();
  await expect(page).toHaveURL(/\/orders\/new$/);

  await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled();
  await page.getByRole("button", { name: "Place order" }).click();
  await expectAwaitingPayment(page);
});

test("a member without file.write can't upload", async ({ page }) => {
  await openAsStaff(page, ORDER_TAKER.email);
  await openNewOrder(page);
  await pickCustomer(page, "Luna Jewels");
  await pickProduct(page, "Cast ring");

  await expect(page.getByText("You can't upload the model. Ask an admin for file access.")).toBeVisible();
  await expect(page.getByLabel("Upload a model")).toHaveCount(0);
});

test("Place is sticky and full width on a phone", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "phone layout");
  await openAsStaff(page);
  await priceNameplate(page);
  await chooseCourier(page);

  const place = page.getByRole("button", { name: "Place order" });
  const viewport = page.viewportSize()!;

  // The page is taller than the screen, and Place stays in view at its top and at its bottom.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(viewport.height);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(place).toBeInViewport({ ratio: 1 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(place).toBeInViewport({ ratio: 1 });

  // Full width: the screen less the bar's own padding (16px a side).
  const box = (await place.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 40);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

  // Scrolled to the end, the last field sits above the bar, never behind it.
  const note = (await page.getByRole("textbox", { name: "Note" }).boundingBox())!;
  const bar = (await ticket(page).boundingBox())!;
  expect(note.y + note.height).toBeLessThanOrEqual(bar.y);
});

test("opens the details sheet on a phone", async ({ page }) => {
  test.skip(isWide(page), "below 1280px");
  await openAsStaff(page);
  await priceNameplate(page);
  await chooseCourier(page);

  const details = page.getByRole("button", { name: "See details" });
  await details.click();
  const sheet = page.getByRole("dialog", { name: "Order" });
  await expect(sheet.getByText("Unit price")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Place order" })).toBeVisible();
  // Focus moves into the sheet, and back to See details when it closes.
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(details).toBeFocused();
});

test("shows the ticket beside the form at 1280px", async ({ page }) => {
  test.skip(!isWide(page), "1280px and wider");
  await openAsStaff(page);
  await priceNameplate(page);

  const aside = ticket(page);
  await expect(aside.getByText("Unit price")).toBeVisible();
  await expect(page.getByRole("button", { name: "See details" })).toHaveCount(0);
  const form = (await page.getByRole("region", { name: "Delivery" }).boundingBox())!;
  const beside = (await aside.boundingBox())!;
  expect(beside.x).toBeGreaterThanOrEqual(form.x + form.width);
});

test("fits the screen", async ({ page }) => {
  await openAsStaff(page);
  await priceNameplate(page);
  await chooseCourier(page);
  await settled(page);
  await expectNoSideScroll(page);
});

test("is accessible with every section open", async ({ page }) => {
  await openAsStaff(page);
  await priceNameplate(page);
  await chooseCourier(page);
  await settled(page);
  await expectNoAxeViolations(page);
});
