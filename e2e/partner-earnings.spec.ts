import type { Page } from "@playwright/test";

import { RING_BAND_JOB_ID } from "../test/fake-erp-api/partner-jobs";
import { NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER } from "../test/fake-erp-api/seed";

import { expect, expectNoSideScroll, signIn, test } from "./helpers";

// Run on a desktop and on Safari at phone size, as the partner Jobs flows are.

const DASHBOARD = `/partner-portal/${NORTHCAST_ID}/dashboard`;
const JOBS = `/partner-portal/${NORTHCAST_ID}/jobs`;
const EARNINGS = `/partner-portal/${NORTHCAST_ID}/earnings`;

/** Signs in as Northcast's owner and opens Earnings, with what's owed and the payouts loaded. */
async function openEarnings(page: Page) {
  await signIn(page, PARTNER.email);
  await expect(page).toHaveURL(DASHBOARD);
  await page.goto(EARNINGS);
  await expect(page.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();
  await expect(page.getByText("€1,240.00")).toBeVisible();
  await expect(page.getByRole("button", { name: /^On its way/ })).toBeVisible();
}

test("an owner sets up payouts", async ({ page }) => {
  await openEarnings(page);
  await expect(page.getByText("Set up payouts so the workspace can pay you.")).toBeVisible();

  // The fake provider finishes setup at once and sends the owner back through /payout-account.
  await page.getByRole("button", { name: "Set up payouts" }).click();

  await expect(page).toHaveURL(EARNINGS);
  await expect(page.getByText("Payouts are set up.")).toBeVisible();
  await expect(page.getByText("Set up payouts so the workspace can pay you.")).toHaveCount(0);
});

test("a setup link that ran out says so once, at the plain Earnings address", async ({ page }) => {
  await openEarnings(page);
  // As the payment provider sends the owner back, with its `?onboarding=` part.
  await page.goto(`/partner-portal/${NORTHCAST_ID}/payout-account?onboarding=expired`);
  await expect(page).toHaveURL(EARNINGS);
  await expect(page.getByText("That setup link ran out.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Set up payouts so the workspace can pay you.")).toBeVisible();
  await expect(page.getByText("That setup link ran out.")).toHaveCount(0);
});

test("an owner reads a payout and a job's pay", async ({ page }) => {
  await openEarnings(page);

  const pending = page.getByRole("button", { name: /^On its way/ });
  await pending.click();
  await expect(pending).toHaveAttribute("aria-expanded", "true");
  const jobs = page.getByRole("list", { name: "Jobs this payout paid for" });
  await expect(jobs.getByText("Charm · 10 pieces")).toBeVisible();
  await expect(jobs.getByText("Taken back: €40.00")).toBeVisible();
  await expectNoSideScroll(page);

  await page.getByRole("tab", { name: "Jobs" }).click();
  await expect(page.getByText("Taken back, nothing owed")).toBeVisible();
  await expect(page).toHaveURL(EARNINGS);
  await expectNoSideScroll(page);

  await page.getByRole("link", { name: /^Ring band/ }).click();
  await expect(page).toHaveURL(`${JOBS}/${RING_BAND_JOB_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ring band · Brass" })).toBeVisible();
});

test("a member doesn't see earnings", async ({ page }) => {
  await signIn(page, NORTHCAST_MEMBER.email);
  await expect(page).toHaveURL(DASHBOARD);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // On a phone the sidebar is a closed menu, so no link shows there for anyone; on a desktop only the member's lacks it.
  await expect(page.getByRole("link", { name: "Earnings" })).toHaveCount(0);

  await page.goto(EARNINGS);
  await expect(page.getByText("Only your workshop's owner and admins can see earnings.")).toBeVisible();
  await expect(page.getByText("€1,240.00")).toHaveCount(0);
});

test("a payout notice opens earnings", async ({ page }) => {
  await signIn(page, PARTNER.email);
  await expect(page).toHaveURL(DASHBOARD);

  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: /You have been paid/ }).click();

  await expect(page).toHaveURL(EARNINGS);
  await expect(page.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();
});
