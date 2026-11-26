import type { Page } from "@playwright/test";

import { LUNA_ID, MIRA_ID, STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";

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
  });
}

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
    await page.keyboard.press("End");
    await page.keyboard.type(" SAS");
    await dialog.getByRole("button", { name: "Save" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Luna Jewels SAS" })).toBeVisible();
    await expect(edit).toBeFocused();
  });
});
