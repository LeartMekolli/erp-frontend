import type { Page } from "@playwright/test";

import { RING_BAND_JOB_ID, RING_OFFER_ID } from "../test/fake-erp-api/partner-jobs";
import { NORTHCAST_ID, PARTNER, STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";
import { FAKE_URL } from "./urls";

// Partners work from phones too, so these run on a desktop and on Safari at phone size.

const JOBS = `/partner-portal/${NORTHCAST_ID}/jobs`;
/** Order #1048, which Ring band is made for (`orders-seed.ts`). */
const ORDER_1048 = "22222222-0000-4000-8000-000000001048";

/** The box of offers waiting for an answer, whatever its count. */
const offers = (page: Page) => page.getByRole("region", { name: /^Waiting for your answer/ });
const offer = (page: Page, title: string) => offers(page).getByRole("listitem").filter({ hasText: title });

/** Signs in as Northcast's owner and waits for Jobs with both offers. */
async function openJobs(page: Page) {
  await signIn(page, PARTNER.email);
  await expect(page).toHaveURL(JOBS);
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Waiting for your answer · 2" })).toBeVisible();
}

test("a partner accepts an offer", async ({ page }) => {
  await openJobs(page);
  await offer(page, "Ring · Silver 925").getByRole("button", { name: "Accept" }).click();

  await expect(page.getByText("Ring · Silver 925 is yours.", { exact: true })).toBeVisible();
  // The offer and its buttons are gone: focus waits on the notice.
  await expect(page.getByRole("status").filter({ hasText: "Ring · Silver 925 is yours." })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Waiting for your answer · 1" })).toBeVisible();
  // The notice holds the title too: look for the job's row in In progress.
  await expect(page.getByRole("tabpanel", { name: "In progress" }).getByRole("link", { name: /^Ring · Silver 925 10 pieces\b/ })).toBeVisible();
  await page.getByRole("link", { name: "Open job" }).click();

  await expect(page).toHaveURL(`${JOBS}/${RING_OFFER_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ring · Silver 925" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pieces" })).toBeVisible();
  await expect(page.getByText("No pieces yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
});

test("a partner declines an offer", async ({ page }) => {
  await openJobs(page);
  await offer(page, "Ring · Silver 925").getByRole("button", { name: "Decline" }).click();

  const dialog = page.getByRole("dialog", { name: "Decline this job?" });
  await expect(dialog.getByText("Staff will offer it to someone else. You can't undo this.")).toBeVisible();
  await dialog.getByRole("button", { name: "Decline job" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("You declined Ring · Silver 925.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Waiting for your answer · 1" })).toBeVisible();
  await expect(offer(page, "Ring · Silver 925")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "You declined Ring · Silver 925." })).toBeFocused();
});

test("a suspended workshop can't answer", async ({ page, request }) => {
  await request.post(`${FAKE_URL}/__suspend-partner/${NORTHCAST_ID}`);
  await signIn(page, PARTNER.email);
  await expect(
    page.getByText("Your workshop is suspended. You can finish the jobs you have, but you can't take new ones."),
  ).toBeVisible();

  // The offers and the jobs still list; only the answers are gone.
  await expect(page.getByRole("heading", { name: "Waiting for your answer · 2" })).toBeVisible();
  await expect(page.getByText("Ring band · Brass", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Decline" })).toHaveCount(0);
});

test("a job notice opens the job", async ({ page }) => {
  await openJobs(page);
  // Start somewhere else, so the notice has somewhere to go.
  await page.goto(`/partner-portal/${NORTHCAST_ID}/earnings`);
  await expect(page.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();

  await page.getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("button", { name: /New job offered: Ring/ }).click();

  await expect(page).toHaveURL(`${JOBS}/${RING_OFFER_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ring · Silver 925" })).toBeVisible();
});

/** Signs in as Northcast's owner and opens Ring band, the job it has in progress. */
async function openRingBand(page: Page) {
  await openJobs(page);
  await page.goto(`${JOBS}/${RING_BAND_JOB_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ring band · Brass" })).toBeVisible();
}

const tick = (page: Page, label: string) => page.getByRole("checkbox", { name: `Select ${label}` }).click();
const bar = (page: Page) => page.getByRole("region", { name: "Selected pieces" });
const stripItem = (page: Page, name: string) => page.getByRole("list", { name: "Progress through the steps" }).getByRole("listitem").filter({ hasText: name });

test("a partner passes a piece with a photo", async ({ page }) => {
  await openRingBand(page);
  await expect(stripItem(page, "Your part done")).toContainText("4");
  await tick(page, "4/12");
  await expect(bar(page)).toContainText("1 piece at Finish");
  const pass = bar(page).getByRole("button", { name: "Pass", exact: true });
  await expect(pass).toBeEnabled();
  await pass.click();

  const dialog = page.getByRole("dialog", { name: "Pass 1 piece at Finish" });
  await dialog.getByRole("group", { name: "Surface smooth" }).getByRole("radio", { name: "Yes" }).check();
  await dialog.getByLabel("Photos").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("photo") });
  await expect(dialog.getByRole("button", { name: "Remove photo.jpg" })).toBeVisible();
  await dialog.getByRole("button", { name: "Pass", exact: true }).click();

  await expect(page.getByText("1 piece passed at Finish.")).toBeVisible();
  await expect(stripItem(page, "Your part done")).toContainText("5");
  await expect(page.getByRole("checkbox", { name: "Select 4/12" })).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);
});

test("a partner fails a piece into rework", async ({ page }) => {
  await openRingBand(page);
  await tick(page, "4/12");
  const fail = bar(page).getByRole("button", { name: "Fail…" });
  await expect(fail).toBeEnabled();
  await fail.click();

  const dialog = page.getByRole("dialog", { name: "Fail 1 piece at Finish" });
  await dialog.getByLabel("Defect").selectOption({ label: "Scratch" });
  await expect(dialog.getByText("Goes back to Finish to be redone")).toBeVisible();
  await dialog.getByRole("button", { name: "Fail", exact: true }).click();

  await expect(page.getByText("1 piece failed at Finish.")).toBeVisible();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "History of 4/12" }) });
  await expect(row).toContainText("Being redone");
});

test("a partner comments and staff read it", async ({ page }) => {
  await openRingBand(page);
  await page.getByRole("tab", { name: "Comments" }).click();
  await expect(page).toHaveURL(`${JOBS}/${RING_BAND_JOB_ID}?tab=comments`);
  const thread = page.getByRole("list", { name: "Comments" });
  await expect(thread.getByRole("listitem").filter({ hasText: "Matte polish on these, please." })).toContainText("Staff");
  await expect(page.getByText("Staff at Demo will read this.")).toBeVisible();
  await page.getByLabel("Add a comment").fill("Polished, packing tomorrow.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(thread.getByRole("listitem").filter({ hasText: "Polished, packing tomorrow." })).toContainText(PARTNER.name);

  // Staff find it on the order the job is made for.
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("status")).toHaveText("You've signed out.");
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto(`/orders/${ORDER_1048}`);
  const comments = page.getByRole("region", { name: "Comments" });
  await expect(comments.getByRole("listitem").filter({ hasText: "Polished, packing tomorrow." })).toContainText(PARTNER.name);
});

test("the tab is in the address", async ({ page }) => {
  await openJobs(page);
  await expect(page.getByText("Ring band · Brass", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Finished" }).click();
  await expect(page).toHaveURL(`${JOBS}?tab=finished`);
  await expect(page.getByText("Earring · Silver 925", { exact: true })).toBeVisible();
  await expect(page.getByText("Ring band · Brass", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("tab", { name: "Finished" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Earring · Silver 925", { exact: true })).toBeVisible();
});
