import type { Page } from "@playwright/test";

import { uuid } from "../test/fake-erp-api/orders-seed";
import { NORTHCAST_ID, PARTNER, STAFF } from "../test/fake-erp-api/seed";

import { expect, expectNoSideScroll, signIn, test } from "./helpers";
import { FAKE_URL } from "./urls";

// Run on a desktop and on Safari at phone size, as the partner Earnings flows are.

const PARTNER_PAGE = `/partners/${NORTHCAST_ID}`;
/** Order #1042, as `orders-seed.ts` names it. */
const ORDER_1042 = uuid("22222222", 1042);
/** How often the page re-reads while a payout is on its way (`PAYOUT_POLL_MS`). */
const POLL_MS = 15_000;

/** Signs in as the workspace's owner and opens Northcast's page from the Partners list. */
async function openNorthcast(page: Page) {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  // On a phone the sidebar is a closed menu, so the list is opened by its address.
  await page.goto("/partners");
  await expect(page.getByRole("heading", { level: 1, name: "Partners" })).toBeVisible();
  await page.getByRole("link", { name: /^Northcast Foundry/ }).click();
  await expect(page).toHaveURL(PARTNER_PAGE);
  await expect(page.getByRole("heading", { level: 1, name: "Northcast Foundry" })).toBeVisible();
}

test("staff pay a partner and the partner sees it", async ({ page, request }) => {
  // The seeded payout on its way is paid, and Northcast's payout account is ready, so Pay is open.
  await request.post(`${FAKE_URL}/__settle-payout/${NORTHCAST_ID}/paid`);
  await request.post(`${FAKE_URL}/__payout-account/${NORTHCAST_ID}/ready`);
  await page.clock.install();

  await openNorthcast(page);
  await expect(page.getByText("Payouts ready")).toBeVisible();
  const lastPayout = page.getByText(/^Last payout:/);
  await expect(lastPayout).toHaveText(/^Last payout: Paid · €420\.00 · /);

  const pay = page.getByRole("button", { name: "Pay €1,240.00" });
  await expect(pay).toBeEnabled();
  await pay.click();
  const dialog = page.getByRole("dialog", { name: "Pay Northcast Foundry €1,240.00?" });
  await expect(
    dialog.getByText("This sends everything owed now to their payout account. If more became owed since this page loaded, that's included too."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Pay", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(lastPayout).toHaveText(/^Last payout: On its way · €1,240\.00 · /);
  // Everything owed is now in the payout on its way, so Pay reads €0.00 and says why it's closed.
  await expect(page.getByRole("button", { name: "Pay €0.00" })).toBeVisible();
  await expect(page.getByText("A payout is on its way.")).toBeVisible();

  // The provider pays it; the next poll shows it without a reload. Each re-read restarts the poll's
  // timer, and Pay's own re-read may land after the first jump, so time moves on a few more times at most.
  await request.post(`${FAKE_URL}/__settle-payout/${NORTHCAST_ID}/paid`);
  await page.clock.fastForward(POLL_MS);
  let tries = 0;
  await expect(async () => {
    if (tries++ > 0) await page.clock.fastForward(POLL_MS);
    await expect(lastPayout).toHaveText(/^Last payout: Paid · €1,240\.00 · /, { timeout: 1_000 });
  }).toPass({ timeout: 5_000, intervals: [0] });
  await expect(page.getByText("Nothing to pay now.")).toBeVisible();

  // The workshop's owner reads the same payout in Earnings.
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("status")).toHaveText("You've signed out.");
  await signIn(page, PARTNER.email);
  await expect(page).toHaveURL(`/partner-portal/${NORTHCAST_ID}/jobs`);
  await page.goto(`/partner-portal/${NORTHCAST_ID}/earnings`);
  await expect(page.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();
  const newest = page.getByRole("button", { name: /^(On its way|Paid|Failed|Reversed)/ }).first();
  await expect(newest).toHaveText(/^Paid.*€1,240\.00/);
  await expect(page.getByRole("region", { name: "What you're owed" }).getByText("€0.00", { exact: true })).toBeVisible();
});

test("a job opens its order", async ({ page }) => {
  await openNorthcast(page);
  await expect(page.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true");
  const order = page.getByRole("link", { name: "Order #1042 · line 2" });
  await expect(order).toBeVisible();
  await expectNoSideScroll(page);

  await order.click();
  await expect(page).toHaveURL(`/orders/${ORDER_1042}`);
  await expect(page.getByRole("heading", { level: 1, name: "#1042" })).toBeVisible();
});

test("a failed payout notice opens the partner's payouts", async ({ page }) => {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();

  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page
    .getByRole("dialog", { name: "Notifications" })
    .getByRole("button", { name: /A payout to Northcast Foundry failed/ })
    .click();

  await expect(page).toHaveURL(`${PARTNER_PAGE}?tab=payouts`);
  await expect(page.getByRole("tab", { name: "Payouts" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Failed. Owed again", { exact: true })).toBeVisible();
  await expect(page.getByText("The payment provider said: The partner's bank refused the transfer")).toBeVisible();
  await expectNoSideScroll(page);
});

test("staff copy a setup link", async ({ page, context, browserName }) => {
  // Only Chromium takes clipboard permissions; Safari may refuse the clipboard, and then the link shows to copy by hand.
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openNorthcast(page);
  await expect(page.getByText("Payouts not set up")).toBeVisible();

  await page.getByRole("button", { name: "Copy setup link" }).click();

  const copied = page.getByText(/^Link copied\. It works once, until .+\. Send it to the partner's owner\.$/);
  if (browserName === "chromium") {
    await expect(copied).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/fake-provider/onboarding?partner=${NORTHCAST_ID}`);
  } else {
    const byHand = page.getByLabel("Setup link");
    await expect(copied.or(byHand)).toBeVisible();
    if (await byHand.isVisible()) {
      await expect(byHand).toHaveValue(new RegExp(`/fake-provider/onboarding\\?partner=${NORTHCAST_ID}$`));
      await expect(page.getByText(/^Copy it by hand\. It works once, until .+\.$/)).toBeVisible();
    }
  }
});
