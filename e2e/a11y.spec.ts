import type { Locator, Page } from "@playwright/test";

import { LONG_NAME_JOB_ID, LONG_PRODUCT_NAME, RING_BAND_JOB_ID } from "../test/fake-erp-api/partner-jobs";
import { NORTHCAST_ID, PARTNER, PARTNER_TWO_SHOPS, RESET_TOKEN, STAFF, STAFF_INVITE_TOKEN } from "../test/fake-erp-api/seed";

import { expect, expectNoAxeViolations, expectNoSideScroll, settled, signIn, test } from "./helpers";
import { chooseCourier, getPrice, openNewOrder, pickCustomer, pickProduct } from "./new-order-steps";
import { FAKE_URL } from "./urls";

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

test("new order: accessible and fits the screen", async ({ page }) => {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await openNewOrder(page);
  await expectAccessibleAndFits(page);

  // Luna picked: the product fields and the Delivery panel are open.
  await pickCustomer(page, "Luna Jewels");
  await expect(page.getByText(/^Trade · /)).toBeVisible();
  await expectAccessibleAndFits(page);

  // Priced and shipping chosen: the price shown, with Place order's bar.
  await pickProduct(page, "Nameplate");
  await page.getByRole("combobox", { name: "Size" }).selectOption({ label: "M" });
  await getPrice(page);
  await chooseCourier(page);
  await expectAccessibleAndFits(page);
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

/** The fake's 60-character job with its three options (`partner-jobs.ts`). */
const LONG_JOB_TITLE = `${LONG_PRODUCT_NAME} · Silver 925 · Brushed satin with a hand-polished edge · Natural`;

/** A row of the Jobs table by what it holds. */
const jobRow = (page: Page, title: string) => page.getByRole("region", { name: "Job list" }).getByRole("row").filter({ hasText: title });

/** Signs in as Northcast's owner and waits for both offers and the jobs in progress, the 60-character one among them. */
async function openPartnerJobs(page: Page) {
  await signIn(page, PARTNER.email);
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Waiting for your answer" })).toContainText("2 offers");
  await expect(jobRow(page, LONG_JOB_TITLE)).toBeVisible();
  await expect(jobRow(page, "Ring band · Brass")).toBeVisible();
}

// Every size, 1024 px included: the long job's title is cut, never the table widened, and Ring
// band's lost count and the long job's amount must still fit.
test("partner jobs: accessible and fits the screen", async ({ page }) => {
  await openPartnerJobs(page);
  await expectAccessibleAndFits(page);

  // The offers, with their answers in the last column at every size.
  await page.getByRole("region", { name: "Job list" }).getByRole("tab", { name: "Offers 2" }).click();
  await expect(jobRow(page, "Ring · Silver 925")).toBeVisible();
  await expectAccessibleAndFits(page);

  // A bottom sheet on phones, a dialog from 640 px.
  await jobRow(page, "Ring · Silver 925").getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("dialog", { name: "Take Ring · Silver 925?" })).toBeVisible();
  await expectAccessibleAndFits(page);
});

test("partner job: accessible and fits the screen", async ({ page }) => {
  await openPartnerJobs(page);
  await page.goto(`/partner-portal/${NORTHCAST_ID}/jobs/${LONG_NAME_JOB_ID}`);
  // The title wraps rather than widening the page.
  await expect(page.getByRole("heading", { level: 1, name: LONG_JOB_TITLE })).toBeVisible();
  await expect(page.getByText("No pieces yet.")).toBeVisible();
  await expectAccessibleAndFits(page);
});

/** Opens a tab of the job and checks it, from the top: a tab's click can scroll it under the sticky top bar. */
async function checkTab(page: Page, name: string | RegExp, shows: Locator) {
  await page.getByRole("tab", { name }).click();
  await expect(shows).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectAccessibleAndFits(page);
}

test("partner earnings: accessible and fits the screen", async ({ page }) => {
  await signIn(page, PARTNER.email);
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await page.goto(`/partner-portal/${NORTHCAST_ID}/earnings`);
  const pending = page.getByRole("button", { name: /^On its way/ });
  await expect(pending).toBeVisible();
  await expect(page.getByText("Set up payouts so the workspace can pay you.")).toBeVisible();
  await expectAccessibleAndFits(page);

  // A payout opened to its jobs, one of them taken back.
  await pending.click();
  await expect(page.getByText("Taken back: €40.00")).toBeVisible();
  await expectAccessibleAndFits(page);

  await checkTab(page, "Jobs", page.getByText("Taken back, nothing owed"));
});

test("partners: accessible and fits the screen", async ({ page }) => {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto("/partners");
  await expect(page.getByRole("heading", { level: 1, name: "Partners" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Northcast Foundry/ })).toBeVisible();
  await expectAccessibleAndFits(page);
});

test("partner page: accessible and fits the screen", async ({ page, request }) => {
  // Northcast's payout account is ready and its seeded payout is still on its way, so Pay shows closed, with its reason.
  await request.post(`${FAKE_URL}/__payout-account/${NORTHCAST_ID}/ready`);
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto(`/partners/${NORTHCAST_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Northcast Foundry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay €1,240.00" })).toBeVisible();
  await expect(page.getByText("A payout is on its way.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Order #1042 · line 2" })).toBeVisible();
  await expectAccessibleAndFits(page);

  await checkTab(page, "Payouts", page.getByText("The payment provider said: The partner's bank refused the transfer"));
});

test("partner job tabs: accessible and fits the screen", async ({ page }) => {
  await openPartnerJobs(page);
  await page.goto(`/partner-portal/${NORTHCAST_ID}/jobs/${RING_BAND_JOB_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ring band · Brass" })).toBeVisible();

  // Pieces with one picked, then the move dialog: a bottom sheet on phones.
  await page.getByRole("checkbox", { name: "Select 4/12" }).click();
  const pass = page.getByRole("region", { name: "Selected pieces" }).getByRole("button", { name: "Pass", exact: true });
  await expect(pass).toBeEnabled();
  await expectAccessibleAndFits(page);
  await pass.click();
  await expect(page.getByRole("dialog", { name: "Pass 1 piece at Finish" })).toBeVisible();
  await expectAccessibleAndFits(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A piece's story, from the right or up from the bottom.
  await page.getByRole("link", { name: "History of 3/12" }).click();
  await expect(page.getByRole("dialog", { name: "Piece 3/12" })).toBeVisible();
  await expectAccessibleAndFits(page);
  await page.getByRole("dialog", { name: "Piece 3/12" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await checkTab(page, /^Quality/, page.getByRole("article", { name: "Finish" }));
  await checkTab(page, "History", page.getByText("Came to you"));
  await checkTab(page, "Comments", page.getByText("Matte polish on these, please."));
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
