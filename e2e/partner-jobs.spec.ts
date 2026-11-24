import type { Page } from "@playwright/test";

import { RING_BAND_JOB_ID, RING_OFFER_ID } from "../test/fake-erp-api/partner-jobs";
import { NORTHCAST_ID, PARTNER, STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";
import { FAKE_URL } from "./urls";

// Partners work from phones too, so these run on a desktop and on Safari at phone size.

const JOBS = `/partner-portal/${NORTHCAST_ID}/jobs`;
/** Order #1048, which Ring band is made for (`orders-seed.ts`). */
const ORDER_1048 = "22222222-0000-4000-8000-000000001048";

/** The Jobs list panel, and a row of its table by what it holds. */
const jobList = (page: Page) => page.getByRole("region", { name: "Job list" });
const row = (page: Page, title: string) => jobList(page).getByRole("row").filter({ hasText: title });
const offer = row;
/** The "Waiting for your answer" tile. */
const offersTile = (page: Page) => page.getByRole("region", { name: "Waiting for your answer" });

/** Signs in as Northcast's owner and opens Jobs on its Offers tab, with both offers. */
async function openJobs(page: Page) {
  await signIn(page, PARTNER.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto(JOBS);
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await expect(offersTile(page)).toContainText("2 offers");
  await offersTile(page).getByRole("button", { name: "Review" }).click();
  await expect(jobList(page).getByRole("tab", { name: "Offers 2" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(JOBS);
}

test("a partner accepts an offer", async ({ page }) => {
  await openJobs(page);
  await offer(page, "Ring · Silver 925").getByRole("button", { name: "Accept" }).click();

  // Accept asks first, with what taking the job means.
  const dialog = page.getByRole("dialog", { name: "Take Ring · Silver 925?" });
  await expect(dialog.getByText("€240.00 for 10 pieces")).toBeVisible();
  await expect(dialog.getByText("Your steps: Casting")).toBeVisible();
  await dialog.getByRole("button", { name: "Accept job" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Ring · Silver 925 is yours.", { exact: true })).toBeVisible();
  // The offer and its buttons are gone: focus waits on the notice.
  await expect(page.getByRole("status").filter({ hasText: "Ring · Silver 925 is yours." })).toBeFocused();
  await expect(offersTile(page)).toContainText("1 offer");
  await expect(offer(page, "Ring · Silver 925")).toHaveCount(0);
  // The taken job is now in progress.
  await jobList(page).getByRole("tab", { name: "In progress" }).click();
  await expect(row(page, "Ring · Silver 925")).toBeVisible();
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
  await expect(offersTile(page)).toContainText("1 offer");
  await expect(offer(page, "Ring · Silver 925")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "You declined Ring · Silver 925." })).toBeFocused();
});

test("a suspended workshop can't answer", async ({ page, request }) => {
  await request.post(`${FAKE_URL}/__suspend-partner/${NORTHCAST_ID}`);
  await signIn(page, PARTNER.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto(JOBS);
  await expect(
    page.getByText("Your workshop is suspended. You can finish the jobs you have, but you can't take new ones."),
  ).toBeVisible();

  // The offers and the jobs still list; only the answers are gone.
  await expect(offersTile(page)).toContainText("2 offers");
  await expect(row(page, "Ring band · Brass")).toBeVisible();
  await jobList(page).getByRole("tab", { name: "Offers 2" }).click();
  await expect(row(page, "Ring · Silver 925")).toBeVisible();
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
/** A section's toggle in the Pieces tab, named by its step and count: `Your part done 4`. */
const sectionToggle = (page: Page, name: string) => page.getByRole("tabpanel", { name: "Pieces" }).getByRole("button", { name: new RegExp(`^${name}\\b`) });

test("a partner passes a piece with a photo", async ({ page }) => {
  await openRingBand(page);
  await expect(sectionToggle(page, "Your part done")).toHaveAccessibleName("Your part done 4");
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

  // Focus and the result stay at the step the piece left.
  await expect(sectionToggle(page, "Finish")).toBeFocused();
  await expect(page.getByText("1 piece passed at Finish.")).toBeVisible();
  await expect(sectionToggle(page, "Your part done")).toHaveAccessibleName("Your part done 5");
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
  const row = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "History of 4/12" }) });
  await expect(row).toContainText("Being redone");
});

test("a partner comments and staff read it", async ({ page }) => {
  await openRingBand(page);
  const thread = page.getByRole("region", { name: "Comments" }).getByRole("list", { name: "Comments" });
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

test("the tabs switch on the page, and the address stays plain", async ({ page }) => {
  await openJobs(page);
  await jobList(page).getByRole("tab", { name: "In progress" }).click();
  await expect(row(page, "Ring band · Brass")).toBeVisible();
  await expect(page).toHaveURL(JOBS);

  await jobList(page).getByRole("tab", { name: "Finished" }).click();
  await expect(row(page, "Earring · Silver 925")).toBeVisible();
  await expect(row(page, "Ring band · Brass")).toHaveCount(0);
  await expect(page).toHaveURL(JOBS);

  // A reload opens the default tab.
  await page.reload();
  await expect(jobList(page).getByRole("tab", { name: "In progress" })).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "Ring band · Brass")).toBeVisible();
});
