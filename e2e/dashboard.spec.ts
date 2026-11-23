import type { Page } from "@playwright/test";

import { STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";

/** A phone, a tablet and a desktop: the dashboard's three layouts (spec, Responsive). */
const SIZES = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

/** The hero tile: its heading names the figure and the range. */
const hero = (page: Page) => page.getByRole("region", { name: /^Revenue · / });

/** Signs in as staff with every permission and opens the dashboard with its tiles loaded. */
async function openDashboard(page: Page) {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(hero(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs attention" }).getByRole("link").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Orders placed" })).toBeVisible();
}

for (const size of SIZES) {
  test.describe(`dashboard on a ${size.name} (${size.width}px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("reads hero, then attention, then the KPIs", async ({ page }) => {
      await openDashboard(page);
      const order = await page.locator("section[aria-labelledby]").evaluateAll((tiles) => tiles.map((tile) => tile.querySelector("h2")?.textContent ?? ""));
      const at = (match: (title: string) => boolean) => order.findIndex(match);
      const heroAt = at((title) => title.startsWith("Revenue · "));
      const attentionAt = at((title) => title === "Needs attention");
      const kpiAt = at((title) => title === "Orders placed");
      expect(heroAt).toBe(0);
      expect(attentionAt).toBeGreaterThan(heroAt);
      expect(kpiAt).toBeGreaterThan(attentionAt);
    });

    test("no tile is wider than its column", async ({ page }) => {
      await openDashboard(page);
      await expect(page.getByRole("region", { name: /^Orders by day/ })).toBeVisible();
      const overflowing = await page
        .locator("section[aria-labelledby]")
        .evaluateAll((tiles) => tiles.filter((tile) => tile.scrollWidth > tile.clientWidth).map((tile) => tile.querySelector("h2")?.textContent));
      expect(overflowing).toEqual([]);
    });

    test("This year goes in the address and the hero", async ({ page }) => {
      await openDashboard(page);
      await page.getByRole("group", { name: "Date range" }).getByRole("button", { name: "This year" }).click();
      await expect(page).toHaveURL(/\/dashboard\?range=year$/);
      await expect(page.getByRole("region", { name: "Revenue · this year" })).toBeVisible();
      await expect(page.getByRole("button", { name: "This year" })).toHaveAttribute("aria-pressed", "true");
    });

    test("the arrow keys read the hero chart", async ({ page }) => {
      await openDashboard(page);
      const chart = hero(page).getByRole("figure", { name: /^Revenue by / });
      await chart.focus();
      await page.keyboard.press("ArrowRight");
      // The tooltip sits in the chart's live region (the hidden table has a "This period" column too).
      await expect(chart.locator('[aria-live="polite"]').getByText("This period", { exact: true })).toBeVisible();
    });
  });
}
