import type { Locator, Page } from "@playwright/test";

import { LUNA_ID, MIRA_ID, STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";
import { openNewOrder, pickCustomer, pickProduct } from "./new-order-steps";
import { FAKE_URL } from "./urls";

// Each size is set below; Safari at phone size would repeat the 375 run.
test.skip(({ browserName }) => browserName === "webkit", "sizes are set per block");

async function signedIn(page: Page) {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
}

/** Customers from the sidebar; below 1024 px the sidebar opens from the menu button first. */
async function openFromSidebar(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Customers/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
}

async function openCustomer(page: Page, id: string, name: string) {
  await signedIn(page);
  await page.goto(`/customers/${id}`);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function openNewCustomer(page: Page) {
  await signedIn(page);
  await page.goto("/customers/new");
  await expect(page.getByRole("heading", { level: 1, name: "New customer" })).toBeVisible();
}

/**
 * Fills New customer, on its page or in New order's panel: the name (unless it came from the search),
 * where orders ship, and the first person's email when one is given.
 */
async function fillNewCustomer(form: Page | Locator, { name, email }: { name?: string; email?: string }) {
  if (name !== undefined) await form.getByRole("region", { name: "Customer", exact: true }).getByLabel("Name", { exact: true }).fill(name);
  const shipping = form.getByRole("region", { name: "Shipping address" });
  await shipping.getByLabel("Name", { exact: true }).fill("Sofia Berg");
  await shipping.getByLabel("Address line 1").fill("Storgata 4");
  await shipping.getByLabel("City").fill("Oslo");
  await shipping.getByLabel("Postal code").fill("0155");
  await shipping.getByLabel("Country").fill("NO");
  if (email !== undefined) await form.getByRole("region", { name: "First person (optional)" }).getByLabel("Email").fill(email);
}

/** The line New customer leaves on the customer's page, or under New order's chip. */
const createdNotice = (page: Page, name: string) => page.getByRole("status").filter({ hasText: `${name} was created.` });

/** A customer's page, at a plain address. */
const CUSTOMER_PAGE = /\/customers\/[0-9a-f-]{36}$/;

for (const width of [375, 768, 1280] as const) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("finds Mira from the sidebar's Customers, at plain addresses", async ({ page }) => {
      await signedIn(page);
      await openFromSidebar(page);
      await expect(page).toHaveURL(/\/customers$/);
      await page.getByRole("searchbox", { name: "Search customers" }).fill("mira");
      await expect(page.getByRole("link", { name: "Luna Jewels" })).toHaveCount(0);
      await page.getByRole("link", { name: "Mira Studio" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Mira Studio" })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/customers/${MIRA_ID}$`));
    });

    test("changes Mira's terms", async ({ page }) => {
      await openCustomer(page, MIRA_ID, "Mira Studio");
      const money = page.getByRole("region", { name: "Money" });
      await expect(money.getByText("Pay later · 30 days")).toBeVisible();
      await money.getByRole("button", { name: "Edit terms" }).click();
      const dialog = page.getByRole("dialog", { name: "Edit payment terms" });
      await dialog.getByLabel("Days to pay").fill("45");
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(money.getByText("Pay later · 45 days")).toBeVisible();
    });

    test("disables Luna after asking, and enables her again", async ({ page }) => {
      await openCustomer(page, LUNA_ID, "Luna Jewels");
      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Disable" }).click();
      await page.getByRole("alertdialog", { name: "Disable Luna Jewels?" }).getByRole("button", { name: "Disable" }).click();
      const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1, name: "Luna Jewels" }) });
      await expect(header.getByText("Disabled", { exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: "New order" })).toHaveCount(0);
      await header.getByRole("button", { name: "Enable" }).click();
      await expect(header.getByText("Active", { exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: "New order" })).toBeVisible();
    });

    test("starts a new order with Mira picked", async ({ page }) => {
      await openCustomer(page, MIRA_ID, "Mira Studio");
      // The customer page's own New order: on a phone the top bar has a plain one too, which starts empty.
      await page.getByRole("main").getByRole("link", { name: "New order" }).click();
      await expect(page).toHaveURL(/\/orders\/new$/);
      await expect(page.getByText("No group · Starter")).toBeVisible();
      await expect(page.getByText("Mira Studio").first()).toBeVisible();
    });

    test("opens no dialog after a reload", async ({ page }) => {
      await openCustomer(page, LUNA_ID, "Luna Jewels");
      await page.getByRole("region", { name: "Details" }).getByRole("button", { name: "Edit details" }).click();
      await expect(page.getByRole("dialog", { name: "Edit details" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: "Luna Jewels" })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/customers/${LUNA_ID}$`));
    });

    test("makes a customer from the list and lands on their page", async ({ page }) => {
      await signedIn(page);
      await page.goto("/customers");
      await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
      await page.getByRole("main").getByRole("link", { name: "New customer" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "New customer" })).toBeVisible();
      await expect(page).toHaveURL(/\/customers\/new$/);

      await fillNewCustomer(page, { name: "Atelier Nord" });
      await page.getByRole("button", { name: "Create customer" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Atelier Nord" })).toBeVisible();
      await expect(page).toHaveURL(CUSTOMER_PAGE);
      await expect(createdNotice(page, "Atelier Nord")).toBeVisible();
    });

    test("makes a customer from New order and keeps the order", async ({ page }) => {
      await signedIn(page);
      await page.goto("/orders/new");
      await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible();
      await page.getByPlaceholder("Search customers by name").fill("Atelier Nord");
      await expect(page.getByText("No customer matches “Atelier Nord”.")).toBeVisible();
      await page.getByRole("button", { name: /^New customer/ }).click();

      const panel = page.getByRole("dialog", { name: "New customer" });
      await expect(panel.getByRole("region", { name: "Customer", exact: true }).getByLabel("Name", { exact: true })).toHaveValue("Atelier Nord");
      // The whole screen on a phone, 560 px from a tablet up.
      expect((await panel.boundingBox())!.width).toBeCloseTo(width < 768 ? width : 560, 0);

      await fillNewCustomer(panel, {});
      await panel.getByRole("button", { name: "Create customer" }).click();
      await expect(panel).toHaveCount(0);
      // Still the same order, now with the new customer picked.
      await expect(page).toHaveURL(/\/orders\/new$/);
      await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Customer" }).getByText("Atelier Nord", { exact: true })).toBeVisible();
      await expect(createdNotice(page, "Atelier Nord")).toBeVisible();
    });

    test("the New customer page has two columns from 1024px and one below", async ({ page }) => {
      await openNewCustomer(page);
      const shipping = page.getByRole("region", { name: "Shipping address" });
      const invoices = page.getByRole("region", { name: "Invoices" });
      await expect(invoices).toBeVisible();
      const left = (await shipping.boundingBox())!;
      const right = (await invoices.boundingBox())!;
      if (width >= 1024) expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
      else expect(right.x).toBeCloseTo(left.x, 0);
      // Create stays on screen: in the sticky bar on a desktop, fixed at the bottom on a phone.
      await expect(page.getByRole("button", { name: "Create customer" })).toBeInViewport();
    });
  });
}

test.describe("the first person's invitation, at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("says it's on its way", async ({ page }) => {
    await openNewCustomer(page);
    await fillNewCustomer(page, { name: "Halden Audio", email: "sofia@halden.example" });
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page).toHaveURL(CUSTOMER_PAGE);
    const notice = createdNotice(page, "Halden Audio");
    await expect(notice).toContainText("An invitation is on its way to sofia@halden.example.");
    await expect(page.getByRole("button", { name: "Send again" })).toHaveCount(0);
  });

  test("says it wasn't sent while the workspace has no customer site, and sends it again", async ({ page, request }) => {
    await request.post(`${FAKE_URL}/__invitation-email/no_customer_site`);
    await openNewCustomer(page);
    await fillNewCustomer(page, { name: "Halden Audio", email: "sofia@halden.example" });
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page).toHaveURL(CUSTOMER_PAGE);
    const notice = createdNotice(page, "Halden Audio");
    await expect(notice).toContainText("The invitation to sofia@halden.example wasn't sent");

    // The workspace has a customer site now: Send again goes, and the line says so.
    await request.post(`${FAKE_URL}/__invitation-email/queued`);
    await page.getByRole("button", { name: "Send again" }).click();
    await expect(notice).toContainText("An invitation is on its way to sofia@halden.example.");
    await expect(page.getByRole("button", { name: "Send again" })).toHaveCount(0);
  });

  test("keeps the order's customer when asked, and the panel still says the new one was made", async ({ page, request }) => {
    await request.post(`${FAKE_URL}/__invitation-email/no_customer_site`);
    await signedIn(page);
    await openNewOrder(page);
    await pickCustomer(page, "Luna Jewels");
    await pickProduct(page, "Nameplate");

    await page.getByRole("button", { name: "Change the customer" }).click();
    await page.getByPlaceholder("Search customers by name").fill("Atelier Nord");
    await page.getByRole("button", { name: /^New customer/ }).click();
    const panel = page.getByRole("dialog", { name: "New customer" });
    await fillNewCustomer(panel, { email: "sofia@atelier.example" });
    await panel.getByRole("button", { name: "Create customer" }).click();

    // Picking Atelier Nord would clear the order started for Luna, so it asks; Keep leaves the order as it was.
    await page.getByRole("dialog", { name: "Change the customer?" }).getByRole("button", { name: "Keep" }).click();
    const notice = createdNotice(page, "Atelier Nord");
    await expect(notice).toContainText(
      "The invitation to sofia@atelier.example wasn't sent: its link goes to the workspace's customer site, and this workspace doesn't have one yet. Send it again here once it does, before you leave this page.",
    );
    const link = panel.getByRole("link", { name: "Open Atelier Nord (opens in a new tab)" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", /^\/customers\/[0-9a-f-]{36}$/);

    // Close never asks to discard; the order is still Luna's, at the same address.
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/orders\/new$/);
    await expect(page.getByRole("group", { name: "Customer" }).getByText("Luna Jewels", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Product" })).toHaveValue(/.+/);
  });
});

test.describe("with a keyboard only, at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("searches, opens a customer, and edits them", async ({ page }) => {
    await signedIn(page);
    await page.goto("/customers");
    const search = page.getByRole("searchbox", { name: "Search customers" });
    await search.focus();
    await page.keyboard.type("luna");
    await expect(page.getByRole("link", { name: "Mira Studio" })).toHaveCount(0);
    // Group, Band and Status, then the one row's link.
    for (let n = 0; n < 4; n += 1) await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Luna Jewels" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Luna Jewels" })).toBeVisible();

    const edit = page.getByRole("button", { name: "Edit customer" });
    await edit.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Edit customer" });
    await expect(dialog.getByLabel("Name")).toBeFocused();
    // Radix focuses Name with its text selected; ArrowRight drops the caret at the end on every platform ("End" doesn't on macOS).
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type(" SAS");
    await dialog.getByRole("button", { name: "Save" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Luna Jewels SAS" })).toBeVisible();
    await expect(edit).toBeFocused();
  });
});
