import type { Page } from "@playwright/test";

import { PENDANT_OFFER_ID } from "../test/fake-erp-api/partner-jobs";
import { NORTHCAST_ADMIN, NORTHCAST_ID, NORTHCAST_MEMBER, PARTNER } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";
import { FAKE_URL } from "./urls";

/** A phone, a tablet and a desktop: the dashboard's three layouts (spec, Responsive). */
const SIZES = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

const PEOPLE = [
  { role: "admin", user: NORTHCAST_ADMIN },
  { role: "member", user: NORTHCAST_MEMBER },
] as const;

const DASHBOARD = `/partner-portal/${NORTHCAST_ID}/dashboard`;

/** The hero: its heading names the step and the range. */
const hero = (page: Page) => page.getByRole("region", { name: /^Waiting for / });

/** Signs in, which lands on the workshop's dashboard, and waits for its tiles. */
async function openDashboard(page: Page, email: string) {
  await signIn(page, email);
  await expect(page).toHaveURL(DASHBOARD);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(hero(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Offers waiting for you" }).getByRole("listitem").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Score 4.4 out of 5" })).toBeVisible();
  // Neither the admin nor the member has a notification in the fake.
  await expect(page.getByRole("region", { name: "Recent activity" }).getByText("Nothing yet.")).toBeVisible();
}

for (const size of SIZES) {
  for (const { role, user } of PEOPLE) {
    test.describe(`partner dashboard for an ${role} on a ${size.name} (${size.width}px)`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });

      test("reads the hero, then the offers, then the counts", async ({ page }) => {
        await openDashboard(page, user.email);
        const order = await page.locator("section[aria-labelledby]").evaluateAll((tiles) => tiles.map((tile) => tile.querySelector("h2")?.textContent ?? ""));
        // Admins and owners lead with their earnings; members with the workload.
        const heroAt = order.findIndex((title) => title.startsWith(role === "admin" ? "Earned · " : "Waiting for "));
        const offersAt = order.indexOf("Offers waiting for you");
        const countsAt = order.indexOf("In progress");
        expect(heroAt).toBe(0);
        expect(offersAt).toBeGreaterThan(heroAt);
        expect(countsAt).toBeGreaterThan(offersAt);
      });

      test("no tile is wider than its column", async ({ page }) => {
        await openDashboard(page, user.email);
        await expect(page.getByRole("region", { name: "Pieces at your steps now" }).getByRole("figure")).toBeVisible();
        const overflowing = await page
          .locator("section[aria-labelledby]")
          .evaluateAll((tiles) => tiles.filter((tile) => tile.scrollWidth > tile.clientWidth).map((tile) => tile.querySelector("h2")?.textContent));
        expect(overflowing).toEqual([]);
      });
    });
  }

  test.describe(`partner dashboard on a ${size.name} (${size.width}px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("the arrow keys read the workload chart", async ({ page }) => {
      await openDashboard(page, NORTHCAST_ADMIN.email);
      const chart = hero(page).getByRole("figure", { name: /^Waiting for / });
      await chart.focus();
      await page.keyboard.press("ArrowRight");
      // The tooltip sits in the chart's live region (the hidden table has a "Waiting" column too).
      await expect(chart.locator('[aria-live="polite"]').getByText("Waiting", { exact: true })).toBeVisible();
    });

    test("the arrow keys read each part of the earnings chart", async ({ page }) => {
      await openDashboard(page, NORTHCAST_ADMIN.email);
      const chart = page.getByRole("region", { name: "Earned · last 30 days" }).getByRole("figure", { name: /^Earned per / });
      await chart.focus();
      await page.keyboard.press("End");
      const tooltip = chart.locator('[aria-live="polite"]');
      for (const part of ["Paid out", "On its way", "Owed", "Total"]) await expect(tooltip.getByText(part, { exact: true })).toBeVisible();
    });

    test("the owner submits the setup for approval, then waits for staff", async ({ page, request }) => {
      await request.post(`${FAKE_URL}/__setting-up/${NORTHCAST_ID}`);
      await request.post(`${FAKE_URL}/__payout-account/${NORTHCAST_ID}/ready`);
      // The owner has notifications, so not `openDashboard`, which expects an empty feed.
      await signIn(page, PARTNER.email);
      await expect(page).toHaveURL(DASHBOARD);
      const setup = page.getByRole("region", { name: "Setup still to finish" });
      await setup.getByRole("button", { name: "Submit for approval" }).click();
      await expect(setup.getByRole("listitem").filter({ hasText: "Approved by staff" })).toContainText("Waiting");
      await expect(setup.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
      await expect(page).toHaveURL(DASHBOARD);
    });

    test("a member sees the step to submit but no button", async ({ page, request }) => {
      await request.post(`${FAKE_URL}/__setting-up/${NORTHCAST_ID}`);
      await openDashboard(page, NORTHCAST_MEMBER.email);
      const setup = page.getByRole("region", { name: "Setup still to finish" });
      await expect(setup.getByText("Submit for approval")).toBeVisible();
      await expect(setup.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
    });

    test("Open on an offer opens its job, and the address stays plain", async ({ page }) => {
      await openDashboard(page, NORTHCAST_ADMIN.email);
      const offers = page.getByRole("region", { name: "Offers waiting for you" });
      await offers.getByRole("link", { name: /^Open Pendant/ }).click();
      await expect(page).toHaveURL(`/partner-portal/${NORTHCAST_ID}/jobs/${PENDANT_OFFER_ID}`);
      await expect(page.getByRole("heading", { level: 1, name: /^Pendant/ })).toBeVisible();
    });

    test("7 days goes in the hero, and the address stays plain", async ({ page }) => {
      await openDashboard(page, NORTHCAST_MEMBER.email);
      await page.getByRole("group", { name: "Date range" }).getByRole("button", { name: "7 days" }).click();
      await expect(page.getByRole("region", { name: /^Waiting for .* · last 7 days$/ })).toBeVisible();
      await expect(page).toHaveURL(DASHBOARD);
    });
  });
}
