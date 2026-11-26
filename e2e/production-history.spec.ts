import type { Page } from "@playwright/test";

import { STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";

// Each size is set below; Safari at phone size would repeat the 375 run.
test.skip(({ browserName }) => browserName === "webkit", "sizes are set per block");

/** The seed's fail: one of #1048's pieces failed at Final QC for Porosity, sent back to Finish, with an answer and a photo. */
const SEEDED_FAIL = /^Ana Ruiz failed: Porosity, sent back to Finish, at Final QC$/;

const views = (page: Page) => page.getByRole("tablist", { name: "Production views" });
const feed = (page: Page) => page.getByRole("region", { name: "Moves" });
const moves = (page: Page) => feed(page).getByRole("article");

async function openHistory(page: Page) {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto("/production");
  await views(page).getByRole("tab", { name: "History" }).click();
  await expect(moves(page).first()).toBeVisible();
}

for (const width of [375, 768, 1280] as const) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("lists the moves newest first under Today, at the plain address", async ({ page }) => {
      await openHistory(page);
      await expect(feed(page).getByRole("heading").first()).toHaveText("Today");
      await expect(page).toHaveURL(/\/production$/);
    });

    test("keeps only fails, and opens the Final QC fail with its answer, photo and piece", async ({ page }) => {
      await openHistory(page);
      await page.getByText("Failed", { exact: true }).click();
      await expect(page.getByRole("radio", { name: "Failed" })).toBeChecked();
      const fail = moves(page).filter({ has: page.getByText("failed: Porosity, sent back to Finish") }).first();
      await expect(fail).toHaveAccessibleName(SEEDED_FAIL);
      for (const name of await moves(page).evaluateAll((articles) => articles.map((article) => article.getAttribute("aria-label") ?? ""))) {
        expect(name).toMatch(/ (failed|scrapped|let through)/);
      }
      await fail.getByRole("button", { name: /^Details:/ }).click();
      await expect(fail.getByText("Surface smooth")).toBeVisible();
      await expect(fail.getByRole("img", { name: "Photo 1 at Final QC" })).toBeVisible();
      await expect(fail.getByRole("list", { name: "#1048 · 1 piece" }).getByRole("link", { name: "#1048 · 3/12" })).toBeVisible();
    });

    test("opens a piece's story on its order from History, at the plain order address", async ({ page }) => {
      await openHistory(page);
      const fail = moves(page).filter({ has: page.getByText("failed: Porosity, sent back to Finish") }).first();
      await fail.getByRole("button", { name: /^Details:/ }).click();
      await fail.getByRole("link", { name: "#1048 · 3/12" }).click();
      await expect(page).toHaveURL(/\/orders\/[^?#/]+$/);
      await expect(page.getByRole("dialog", { name: "Piece 3/12" })).toBeVisible();
    });
  });
}

test.describe("at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("shows a pass made on the Board first, just now", async ({ page }) => {
    // The 5 seconds a pass waits are skipped with the clock, not waited out.
    await page.clock.install();
    await signIn(page, STAFF.email);
    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
    await page.goto("/production");
    const print = page.getByRole("region", { name: "Print", exact: true });
    await print.getByRole("button", { name: "Move #1041…" }).click();
    await page.getByRole("menuitem", { name: "Pass to Finish" }).click();
    // The 5 seconds start once the pass waits with Undo; skipping them before that skips nothing.
    await expect(page.getByRole("region", { name: "Finish", exact: true }).getByRole("button", { name: "Undo" })).toBeVisible();
    await page.clock.fastForward(5_000);
    await expect(page.getByText("10 pieces passed to Finish.")).toBeVisible();
    await views(page).getByRole("tab", { name: "History" }).click();
    const newest = moves(page).first();
    await expect(newest).toHaveAccessibleName(/^Ana Ruiz passed, at Print$/);
    await expect(newest.getByText("Just now")).toBeVisible();
    await expect(newest.getByRole("list", { name: "Lines" })).toHaveText(/#1041\s*·\s*10/);
  });

  test("works with the keyboard alone: the result switch, a row's chevron, then a piece", async ({ page }) => {
    await openHistory(page);
    await page.getByRole("radio", { name: "All" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Failed" })).toBeChecked();
    const fail = moves(page).filter({ has: page.getByText("failed: Porosity, sent back to Finish") }).first();
    const chevron = fail.getByRole("button", { name: /^Details:/ });
    await chevron.focus();
    await page.keyboard.press("Enter");
    await expect(chevron).toHaveAttribute("aria-expanded", "true");
    const piece = fail.getByRole("link", { name: "#1048 · 3/12" });
    await expect(piece).toBeVisible();
    for (let tab = 0; tab < 6 && !(await piece.evaluate((link) => link === document.activeElement)); tab += 1) await page.keyboard.press("Tab");
    await expect(piece).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Piece 3/12" })).toBeVisible();
  });
});

test.describe("at 375 px (phone)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("puts the filters in a sheet, and its button counts those set", async ({ page }) => {
    await openHistory(page);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByLabel("Step", { exact: true }).selectOption("final_qc");
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: "Filters · 1" })).toBeVisible();
    await expect(moves(page).first()).toHaveAccessibleName(/, at Final QC$/);
    await expect(page).toHaveURL(/\/production$/);
  });
});
