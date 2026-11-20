import type { Locator, Page } from "@playwright/test";

import { expect } from "./helpers";

/** At 1280px and wider the ticket is an aside beside the form; below, a bar at the bottom with a sheet. */
export function isWide(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1280;
}

/**
 * The order ticket as it shows now: the aside when wide, the bottom bar when narrow. Both are named
 * "Order"; the sheet the bar opens is a dialog of its own.
 */
export function ticket(page: Page): Locator {
  return isWide(page) ? page.getByRole("complementary", { name: "Order" }) : page.getByRole("region", { name: "Order" });
}

/** The fake's customers (`catalog.ts`): Luna pays first and has a saved address in Lyon. */
export async function openNewOrder(page: Page) {
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible();
}

/** Searches for a customer by name and picks the match; their chip shows, and the product select once loaded. */
export async function pickCustomer(page: Page, name: string) {
  await page.getByPlaceholder("Search customers by name").fill(name);
  await page.getByRole("option", { name }).click();
  await expect(page.getByRole("group", { name: "Customer" }).getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Product" })).toBeVisible();
}

export async function pickProduct(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Product" }).selectOption({ label: name });
}

/** Presses Get price (or Get new price) and waits for the ticket's total. */
export async function getPrice(page: Page) {
  await page.getByRole("button", { name: /^Get (new )?price$/ }).click();
  await expect(ticket(page).getByText(/^(Total before tax|Before shipping and tax)$/)).toBeVisible();
}

/** Luna's Nameplate in size M, priced: Delivery shows her saved address and the shipping methods. */
export async function priceNameplate(page: Page) {
  await openNewOrder(page);
  await pickCustomer(page, "Luna Jewels");
  await pickProduct(page, "Nameplate");
  await page.getByRole("combobox", { name: "Size" }).selectOption({ label: "M" });
  await getPrice(page);
}

export async function chooseCourier(page: Page) {
  await page.getByRole("radio", { name: "Courier · €12.00" }).check();
  await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled();
}
