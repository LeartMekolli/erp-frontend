import { PARTNER_TWO_SHOPS, RESET_TOKEN, STAFF, STAFF_INVITE_TOKEN } from "../test/fake-erp-api/seed";

import { expect, expectNoAxeViolations, expectNoSideScroll, signIn, test } from "./helpers";

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
