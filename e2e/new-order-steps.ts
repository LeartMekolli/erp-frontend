import type { Page } from "@playwright/test";

import { expect } from "./helpers";

/** The fake's customers (`catalog.ts`): Luna pays first and has a saved address in Lyon. */
export async function openNewOrder(page: Page) {
  await page.goto("/orders/new");
  await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible();
}

/** Searches for a customer by name and picks the match; the Product section opens once their record has loaded. */
export async function pickCustomer(page: Page, name: string) {
  await page.getByPlaceholder("Search customers by name").fill(name);
  await page.getByRole("option", { name }).click();
  await expect(page.getByRole("combobox", { name: "Product" })).toBeVisible();
}

export async function pickProduct(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Product" }).selectOption({ label: name });
}

/** Presses Get price and waits for the price to show. */
export async function getPrice(page: Page) {
  await page.getByRole("button", { name: "Get price" }).click();
  await expect(page.getByText("Unit price")).toBeVisible();
}

/** Luna's Nameplate in size M, priced: the Delivery section is open with her saved address and the shipping methods. */
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
