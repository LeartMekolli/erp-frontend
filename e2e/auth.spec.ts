import {
  CUSTOMER,
  NORTHCAST_ID,
  PARTNER,
  PARTNER_TWO_SHOPS,
  RESET_TOKEN,
  STAFF,
  STAFF_INVITE_TOKEN,
} from "../test/fake-erp-api/seed";

import { alert, expect, signIn, test } from "./helpers";

const NEW_PASSWORD = "a-new-password-1";

test("staff sign in and land on Orders", async ({ page }) => {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await expect(page).toHaveURL("/orders");
});

test("a partner lands on their own workshop", async ({ page }) => {
  await signIn(page, PARTNER.email);
  await expect(page.getByRole("heading", { name: "Northcast Foundry" })).toBeVisible();
  await expect(page).toHaveURL(`/partner-portal/${NORTHCAST_ID}`);
});

test("a partner with two workshops chooses one", async ({ page }) => {
  await signIn(page, PARTNER_TWO_SHOPS.email);
  await expect(page.getByRole("heading", { name: "Choose a workshop" })).toBeVisible();
  await page.getByRole("link", { name: "Layerline Prints" }).click();
  await expect(page.getByRole("heading", { name: "Layerline Prints" })).toBeVisible();
});

test("a partner opening the staff area sees not found", async ({ page }) => {
  await signIn(page, PARTNER.email);
  await expect(page.getByRole("heading", { name: "Northcast Foundry" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("a customer is turned away", async ({ page }) => {
  await signIn(page, CUSTOMER.email);
  await expect(alert(page, "This account is for ordering. Use your supplier's customer site to sign in.")).toBeVisible();
  await expect(page).toHaveURL("/sign-in");
});

test("a wrong password gets one message for every kind of mistake", async ({ page }) => {
  await signIn(page, STAFF.email, { password: "not-the-password" });
  await expect(alert(page, "That workspace, email and password don't match. Check them and try again.")).toBeVisible();
});

test("asking for a reset says the same thing for any email", async ({ page }) => {
  for (const email of [STAFF.email, "nobody@demo.example.test"]) {
    await page.goto("/forgot-password?workspace=demo");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "If that email has an account in this workspace, a reset link is on its way.",
    );
  }
});

test("a reset link sets a password that signs in", async ({ page }) => {
  await page.goto(`/reset-password#token=${encodeURIComponent(RESET_TOKEN)}`);
  await expect(page.getByLabel("New password")).toBeVisible();
  await expect(page).not.toHaveURL(/token=/);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("status")).toHaveText("Your password is set. Sign in with it now.");
  await signIn(page, STAFF.email, { password: NEW_PASSWORD });
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
});

test("an invitation link from the email joins, then signs in", async ({ page }) => {
  // erp-api's link carries the workspace in front; AMI strips it and keeps the token.
  await page.goto(`/demo/accept-invitation#token=${encodeURIComponent(STAFF_INVITE_TOKEN)}`);
  await expect(page.getByRole("heading", { name: "Join Demo" })).toBeVisible();
  await expect(page).toHaveURL("/accept-invitation");
  await page.getByLabel("Your name").fill("Ana");
  await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("status")).toHaveText("You're in. Sign in to get started.");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByLabel("Workspace")).toHaveValue("demo");
  await signIn(page, "invited@demo.example.test", { password: NEW_PASSWORD });
  await expect(page.getByRole("heading", { name: "Hello, Ana" })).toBeVisible();
});
