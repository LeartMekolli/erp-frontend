import type { Page } from "@playwright/test";

import { PARTNER_TWO_SHOPS, RESET_TOKEN, STAFF, STAFF_INVITE_TOKEN } from "../test/fake-erp-api/seed";

import { expect, expectNoAxeViolations, expectNoSideScroll, settled, signIn, test } from "./helpers";

const link = (path: string, token: string) => `${path}#token=${encodeURIComponent(token)}`;

/** Each page, ready to check once its heading shows. */
const PAGES = [
  { name: "sign-in", path: "/sign-in", heading: "Sign in" },
  { name: "forgot password", path: "/forgot-password", heading: "Reset your password" },
  { name: "reset password", path: link("/reset-password", RESET_TOKEN), heading: "Set a new password" },
  { name: "reset password, expired link", path: "/reset-password", heading: "Set a new password" },
  { name: "accept invitation", path: link("/accept-invitation", STAFF_INVITE_TOKEN), heading: "Join Demo" },
  { name: "accept invitation, expired link", path: "/accept-invitation", heading: "Accept your invitation" },
] as const;

for (const { name, path, heading } of PAGES) {
  test(`${name}: accessible and fits the screen`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoSideScroll(page);
  });
}

test("staff home: accessible and fits the screen", async ({ page }) => {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoSideScroll(page);
});

/** Signs in as staff and waits for the tiles and the list to load. */
async function openOrders(page: Page) {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { name: "Need you today" })).toBeVisible();
  await expect(page.getByRole("row", { name: /#1041\b/ })).toBeVisible();
}

async function expectAccessibleAndFits(page: Page) {
  await settled(page);
  await expectNoAxeViolations(page);
  await expectNoSideScroll(page);
}

test("orders: accessible and fits the screen", async ({ page }) => {
  await openOrders(page);
  await expectAccessibleAndFits(page);

  const width = page.viewportSize()!.width;
  // Phones: a three-line list, with Select to show the checkboxes.
  if (width < 768) await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible();
  // 1024 to 1279: the sidebar is a rail of icons, each named by a tooltip.
  if (width >= 1024 && width < 1280) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Orders/ }).hover();
    await expect(page.getByRole("tooltip", { name: /Orders/ })).toBeVisible();
  }
});

test("command-k: accessible and fits the screen", async ({ page }) => {
  await openOrders(page);
  await page.getByRole("button", { name: /^Search/ }).click();
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  await expectAccessibleAndFits(page);
});

test("notifications: accessible and fits the screen", async ({ page }) => {
  await openOrders(page);
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByRole("button", { name: /Order #1041 is 2 days late/ })).toBeVisible();
  await expectAccessibleAndFits(page);
});

test("ship dialog: accessible and fits the screen", async ({ page }) => {
  await openOrders(page);
  await page.getByRole("button", { name: "Actions for order #1044" }).click();
  // A menu from 768 px, a bottom sheet on phones.
  await page
    .getByRole("menuitem", { name: "Ship" })
    .or(page.getByRole("dialog", { name: "Order #1044" }).getByRole("button", { name: "Ship", exact: true }))
    .click();
  await expect(page.getByRole("dialog", { name: "Ship #1044" })).toBeVisible();
  // The menu fades out after the choice; check the page once it's gone.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expectAccessibleAndFits(page);
});

/** Signs in as staff and opens an order that has pieces to work with. */
async function openOrder(page: Page) {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto("/orders/22222222-0000-4000-8000-000000001048");
  await expect(page.getByRole("heading", { level: 1, name: "#1048" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Progress through the steps" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select 1/12" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Comments" })).toBeVisible();
}

test("order page: accessible and fits the screen", async ({ page }) => {
  await openOrder(page);
  await expectAccessibleAndFits(page);
});

test("order page, quality tab: accessible and fits the screen", async ({ page }) => {
  await openOrder(page);
  await page.getByRole("tab", { name: "Quality" }).click();
  await expect(page.getByRole("article", { name: "Final QC" })).toBeVisible();
  await expectAccessibleAndFits(page);
});

test("order page, history tab: accessible and fits the screen", async ({ page }) => {
  await openOrder(page);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("Failed at Final QC: Porosity")).toBeVisible();
  await page.getByRole("button", { name: /^\d+ pieces$/ }).first().click();
  await expect(page.getByRole("list", { name: "Pieces in this move" })).toBeVisible();
  // The click scrolled the tabs under the sticky top bar, which axe counts as targets too close together.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectAccessibleAndFits(page);
});

test("move bar and dialog: accessible and fit the screen", async ({ page }) => {
  await openOrder(page);
  await page.getByRole("checkbox", { name: "Select 1/12" }).click();
  const pass = page.getByRole("button", { name: "Pass to Finish" });
  await expect(pass).toBeEnabled();
  await expectAccessibleAndFits(page);
  await pass.click();
  await expect(page.getByRole("dialog", { name: "Pass 1 piece at Print" })).toBeVisible();
  await expectAccessibleAndFits(page);
});

test("piece history: accessible and fits the screen", async ({ page }) => {
  await openOrder(page);
  await page.getByRole("link", { name: "History of 1/12" }).click();
  await expect(page.getByRole("dialog", { name: "Piece 1/12" })).toBeVisible();
  await expectAccessibleAndFits(page);
});

test("cancel dialog: accessible and fits the screen", async ({ page }) => {
  await openOrder(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel order" }).click();
  await expect(page.getByRole("dialog", { name: "Cancel #1048" })).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expectAccessibleAndFits(page);
});

test("workshop chooser: accessible and fits the screen", async ({ page }) => {
  await signIn(page, PARTNER_TWO_SHOPS.email);
  await expect(page.getByRole("heading", { name: "Choose a workshop" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoSideScroll(page);
});

test("signing in works with the keyboard alone", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Workspace")).toBeFocused();
  await page.keyboard.type("demo");
  await page.keyboard.press("Tab");
  await page.keyboard.type(STAFF.email);
  await page.keyboard.press("Tab");
  await page.keyboard.type("fake-password-1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
});
