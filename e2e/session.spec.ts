import { NORTHCAST_ID, PARTNER, STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";
import { APP_URL } from "./urls";

const HOME = { name: "Hello, Dana" } as const;

test("a reload stays signed in", async ({ page }) => {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", HOME)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", HOME)).toBeVisible();
});

test("a second tab is signed in too, and signing out in one signs out both", async ({ page, context }) => {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", HOME)).toBeVisible();

  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByRole("heading", HOME)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("status")).toHaveText("You've signed out.");
  await expect(second.getByRole("status")).toHaveText("You've signed out.");
});

test("three hours without activity sign out", async ({ page }) => {
  await page.clock.install();
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", HOME)).toBeVisible();
  await page.clock.fastForward("03:00:01");
  await expect(page.getByRole("status")).toHaveText("You were signed out after 3 hours without activity.");
});

test("twelve hours after sign-in sign out, however active", async ({ page }) => {
  await page.clock.install();
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", HOME)).toBeVisible();
  // Some activity every two hours keeps the idle limit away.
  for (let hours = 0; hours < 13; hours += 2) {
    await page.keyboard.press("Shift");
    await page.clock.fastForward("02:00:00");
  }
  await expect(page.getByRole("status")).toHaveText(
    "You were signed out because your session reached 12 hours. Sign in again to continue.",
  );
});

test("a link followed from another site opens signed in", async ({ page }) => {
  await signIn(page, PARTNER.email);
  await expect(page.getByRole("heading", { name: "Northcast Foundry" })).toBeVisible();

  // 127.0.0.1 is another site than localhost, so the SameSite=Strict cookie isn't sent on this navigation.
  const target = `${APP_URL}/demo/partner-portal/${NORTHCAST_ID}`;
  await page.goto(`http://127.0.0.1:4010/__link?to=${encodeURIComponent(target)}`);
  await page.getByRole("link", { name: "Open AMI" }).click();
  await expect(page).toHaveURL(`${APP_URL}/partner-portal/${NORTHCAST_ID}`);
  await expect(page.getByRole("heading", { name: "Northcast Foundry" })).toBeVisible();
});

test("someone signed in who opens the sign-in page goes home", async ({ page }) => {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", HOME)).toBeVisible();
  await page.goto("/sign-in");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", HOME)).toBeVisible();
});

test("a return link to another site lands at home instead", async ({ page }) => {
  await signIn(page, STAFF.email, { path: "/sign-in?next=%2F%2Fevil.example" });
  await expect(page.getByRole("heading", HOME)).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("a page needing a session sends someone signed out to sign in and back", async ({ page }) => {
  await page.goto("/partner-portal");
  await expect(page).toHaveURL("/sign-in?next=%2Fpartner-portal");
  await signIn(page, PARTNER.email, { path: "/sign-in?next=%2Fpartner-portal" });
  await expect(page.getByRole("heading", { name: "Choose a workshop" })).toBeVisible();
});
