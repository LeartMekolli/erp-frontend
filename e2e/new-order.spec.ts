import type { Page } from "@playwright/test";

import { ORDER_TAKER, STAFF } from "../test/fake-erp-api/seed";

import { expect, expectNoAxeViolations, expectNoSideScroll, settled, signIn, test } from "./helpers";
import { chooseCourier, getPrice, openNewOrder, pickCustomer, pickProduct, priceNameplate } from "./new-order-steps";
import { FAKE_URL } from "./urls";

/** A one-facet ASCII STL. */
const RING_MODEL = "e2e/fixtures/ring.stl";

async function openAsStaff(page: Page, email = STAFF.email) {
  await signIn(page, email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
}

/** Luna's Cast ring at scale 1, with the model uploaded and measured. */
async function prepareRing(page: Page) {
  await openNewOrder(page);
  await pickCustomer(page, "Luna Jewels");
  await pickProduct(page, "Cast ring");
  await page.getByRole("textbox", { name: "Size" }).fill("1");
  await page.getByLabel("Upload a model").setInputFiles(RING_MODEL);
  // The fake measures the file after about a second, and the page polls for it.
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** The order page shows what was just placed: its heading and its state in the header. */
async function expectAwaitingPayment(page: Page) {
  // It says so once, then `placed=1` leaves the address, so a reload doesn't say it again.
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
  await expect(page.getByRole("group", { name: "This can't be priced:" })).toContainText("Brass needs a finish: pick Polished");
  // Delivery is open with the customer now, so Place order is there, and off with no price.
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled();
});

test("changing quantity after a price hides it", async ({ page }) => {
  await openAsStaff(page);
  await priceNameplate(page);
  await chooseCourier(page);

  await page.getByRole("textbox", { name: "Quantity" }).fill("2");
  await expect(page.getByText("Unit price")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled();

  await getPrice(page);
  await expect(page.getByRole("button", { name: "Place order" })).toBeVisible();
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
  const section = page.getByRole("region", { name: "Delivery" });
  const viewport = page.viewportSize()!;

  // With Delivery's heading at the top, its own end is below the screen: the bar holds Place in view.
  await page.getByRole("heading", { level: 2, name: "Delivery", exact: true }).evaluate((heading) => heading.scrollIntoView({ block: "start" }));
  await expect(place).toBeInViewport({ ratio: 1 });

  // Full width: the section's width less its own padding, and inside the screen.
  const box = (await place.boundingBox())!;
  const sectionBox = (await section.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(sectionBox.width - 40);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
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
