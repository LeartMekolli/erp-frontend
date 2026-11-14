import type { Page } from "@playwright/test";

import { RING_OFFER_ID } from "../test/fake-erp-api/partner-jobs";
import { NORTHCAST_ID, PARTNER } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";
import { FAKE_URL } from "./urls";

// Partners work from phones too, so these run on a desktop and on Safari at phone size.

const JOBS = `/partner-portal/${NORTHCAST_ID}/jobs`;

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
  await expect(page.getByRole("heading", { name: "Waiting for your answer · 1" })).toBeVisible();
  await page.getByRole("link", { name: "Open job" }).click();

  await expect(page).toHaveURL(`${JOBS}/${RING_OFFER_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ring · Silver 925" })).toBeVisible();
  await expect(page.getByText("Pieces, quality, history and comments for this job are coming soon.")).toBeVisible();
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

test("a job notice opens Jobs", async ({ page }) => {
  await openJobs(page);
  // Start somewhere else, so the notice has somewhere to go.
  await page.goto(`/partner-portal/${NORTHCAST_ID}/earnings`);
  await expect(page.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();

  await page.getByRole("button", { name: /^Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("button", { name: /New job offered: Ring/ }).click();

  await expect(page).toHaveURL(new RegExp(`/partner-portal/${NORTHCAST_ID}/jobs$`));
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
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
