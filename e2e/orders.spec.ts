import type { Page } from "@playwright/test";

import { CLERK, STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";
import { FAKE_URL } from "./urls";

// Desktop flows: phones are covered by `a11y.spec.ts` at every size.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop flows");

/** The fake's order ids (`orders-seed.ts`). */
const orderId = (number: number) => `22222222-0000-4000-8000-${String(number).padStart(12, "0")}`;

const row = (page: Page, number: number) => page.getByRole("row", { name: new RegExp(`#${number}\\b`) });

async function openOrders(page: Page, email = STAFF.email) {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/orders/);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Need you today" })).toBeVisible();
  await expect(row(page, 1041)).toBeVisible();
}

async function rowAction(page: Page, number: number, action: string) {
  await page.getByRole("button", { name: `Actions for order #${number}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

test("tabs and tiles change the list, not the URL", async ({ page }) => {
  await openOrders(page);
  const url = page.url();
  await page.getByRole("tab", { name: /^All/ }).click();
  await expect(page.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("region", { name: "Need you today" }).getByRole("button", { name: "2 late" }).click();
  await expect(row(page, 1041)).toBeVisible();
  await expect(row(page, 1042)).toBeVisible();
  await expect(row(page, 1044)).toHaveCount(0);
  expect(page.url()).toBe(url);

  await page.getByRole("button", { name: "Remove filter: Late" }).click();
  await expect(row(page, 1044)).toBeVisible();
});

test("ships one order with tracking", async ({ page }) => {
  await openOrders(page);
  await rowAction(page, 1044, "Ship");
  const dialog = page.getByRole("dialog", { name: "Ship #1044" });
  await dialog.getByLabel("Courier").fill("DHL");
  await dialog.getByLabel("Tracking number").fill("JD014600006281");
  await dialog.getByRole("button", { name: "Ship order" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "#1044 shipped." })).toBeVisible();
  // Shipped, it no longer needs anyone: it leaves Needs you.
  await expect(row(page, 1044)).toHaveCount(0);
});

test("ships several orders, one failing, then retries it", async ({ page, request }) => {
  await request.post(`${FAKE_URL}/__fail-next-label/${orderId(1043)}`);
  await openOrders(page);
  for (const number of [1042, 1043, 1044]) await page.getByRole("checkbox", { name: `Select order #${number}` }).check();

  const bar = page.getByRole("region", { name: "Selected orders" });
  await expect(bar).toContainText("3 selected");
  await bar.getByRole("button", { name: "Ship 3" }).click();

  const dialog = page.getByRole("dialog", { name: "Ship 3 orders" });
  await dialog.getByRole("radio", { name: "Buy labels" }).check();
  await dialog.getByRole("button", { name: "Ship 3 orders" }).click();
  await expect(dialog.getByText("2 shipped", { exact: true })).toBeVisible();
  await expect(dialog.getByText("1 not shipped", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Not shipped" })).toContainText("#1043");

  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByText("3 shipped", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Print label for #1043" })).toHaveAttribute("href", /1043\.pdf$/);

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(bar).toBeHidden();
  await expect(row(page, 1042)).toHaveCount(0);
});

test("records a payment", async ({ page }) => {
  await openOrders(page);
  await rowAction(page, 1045, "Record payment");
  const dialog = page.getByRole("dialog", { name: "Record a payment for #1045" });
  await dialog.getByLabel("Reference").fill("TRX-2207");
  await dialog.getByRole("button", { name: "Record payment" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Payment recorded for #1045." })).toBeVisible();
});

test("command-k finds an order and opens it", async ({ page }) => {
  await openOrders(page);
  await page.keyboard.press("ControlOrMeta+k");
  const box = page.getByRole("dialog", { name: "Search" });
  await box.getByPlaceholder("Search or ask a question").fill("1041");
  await expect(box.getByRole("option", { name: /#1041/ })).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/orders/${orderId(1041)}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Order" })).toBeVisible();
});

test("command-k asks the AI and links what it mentions", async ({ page }) => {
  await openOrders(page);
  await page.getByRole("button", { name: /^Search/ }).click();
  const box = page.getByRole("dialog", { name: "Search" });
  await box.getByPlaceholder("Search or ask a question").fill("Why is 1041 late?");
  await box.getByRole("option", { name: /Ask AI/ }).click();

  await expect(box.getByRole("link", { name: "#1041" })).toHaveAttribute("href", `/orders/${orderId(1041)}`);
});

test("opening a notification goes to its order", async ({ page }) => {
  await openOrders(page);
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("button", { name: /Order #1041 is 2 days late/ }).click();

  await expect(page).toHaveURL(new RegExp(`/orders/${orderId(1041)}$`));
});

test("staff without the permissions see no actions and no setup", async ({ page }) => {
  await openOrders(page, CLERK.email);
  await expect(page.getByRole("button", { name: /^Actions for order/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("Setup")).toHaveCount(0);

  await page.goto("/payments");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
