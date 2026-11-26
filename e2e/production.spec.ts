import type { Page } from "@playwright/test";

import { STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";
import { FAKE_URL } from "./urls";

// Each size is set below; Safari at phone size would repeat the 375 run.
test.skip(({ browserName }) => browserName === "webkit", "sizes are set per block");

const SIZES = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

/** The phone's step picker; exact, as "By step" and "Steps" hold the word too. */
const picker = (page: Page) => page.getByLabel("Step", { exact: true });

/** From 768 px the steps are tabs; on a phone, a picker. */
const tabs = (page: Page) => (page.viewportSize()!.width >= 768 ? "tabs" : "picker");

async function openProduction(page: Page) {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto("/production");
  await expect(page.getByRole("heading", { level: 1, name: "Production" })).toBeVisible();
  // The page opens on the Board: By step is the second tab.
  await page.getByRole("tablist", { name: "Production views" }).getByRole("tab", { name: "By step" }).click();
  await expect(page.getByRole("checkbox", { name: "Select #1041" })).toBeVisible();
}

async function expectStep(page: Page, key: string, name: string, count: number) {
  if (tabs(page) === "tabs") {
    await expect(page.getByRole("tab", { name: `${name} ${count}` })).toHaveAttribute("aria-selected", "true");
  } else {
    await expect(picker(page)).toHaveValue(key);
    await expect(picker(page).locator("option:checked")).toHaveText(`${name} · ${count}`);
  }
}

async function pickStep(page: Page, key: string, name: RegExp) {
  if (tabs(page) === "tabs") await page.getByRole("tab", { name }).click();
  else await picker(page).selectOption(key);
}

const bar = (page: Page) => page.getByRole("region", { name: "Picked lines" });

for (const size of SIZES) {
  test.describe(`at ${size.width} px (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("opens on the busiest step and passes a whole line with its checklist and a photo", async ({ page }) => {
      await openProduction(page);
      await expectStep(page, "print", "Print", 26);
      await pickStep(page, "finish", /^Finish/);
      await expectStep(page, "finish", "Finish", 24);

      await page.getByRole("checkbox", { name: "Select #1041" }).click();
      await expect(page.getByRole("checkbox", { name: "Select #1041" })).toHaveAttribute("aria-checked", "true");
      await expect(bar(page)).toContainText("1 line · 20 pieces");
      const pass = bar(page).getByRole("button", { name: "Pass to Final QC" });
      await expect(pass).toBeEnabled();
      await pass.click();

      const dialog = page.getByRole("dialog", { name: "Pass 20 pieces at Finish" });
      await dialog.getByRole("group", { name: "Surface smooth" }).getByRole("radio", { name: "Yes" }).check();
      await dialog.getByLabel("Photos").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("photo") });
      await expect(dialog.getByRole("button", { name: "Remove photo.jpg" })).toBeVisible();
      await dialog.getByRole("button", { name: "Pass to Final QC" }).click();

      await expect(page.getByText("20 pieces passed to Final QC.")).toBeVisible();
      await expectStep(page, "finish", "Finish", 4);
      await expect(bar(page)).toHaveCount(0);
      await expect(page).toHaveURL(/\/production$/);
    });

    test("sends one piece back with its defect", async ({ page }) => {
      await openProduction(page);
      await pickStep(page, "finish", /^Finish/);
      const row = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: "Select #1048" }) });
      await expect(row).toContainText("1 being redone");

      await page.getByRole("button", { name: "Pieces of #1048" }).click();
      // 3/12 is the one already being redone (`production.ts` seeds the first piece at Finish in rework).
      await page.getByRole("checkbox", { name: "Select 4/12" }).click();
      await expect(bar(page)).toContainText("1 line · 1 piece");
      const moveTo = bar(page).getByRole("button", { name: "Move to…" });
      await expect(moveTo).toBeEnabled();
      await moveTo.click();
      await page.getByRole("menuitem", { name: "Send back to Finish" }).click();

      const dialog = page.getByRole("dialog", { name: "Send 1 piece back to Finish" });
      await dialog.getByLabel("Defect").selectOption({ label: "Scratch" });
      await expect(dialog.getByText("Scratch is usually redone at Finish.")).toBeVisible();
      await dialog.getByRole("button", { name: "Send back" }).click();

      await expect(page.getByText("1 piece sent back to Finish.")).toBeVisible();
      await expect(row).toContainText("2 being redone");
      await expect(page).toHaveURL(/\/production$/);
    });

    test("names the skill a step needs that the person lacks", async ({ page, request }) => {
      await request.post(`${FAKE_URL}/__require-skill/finish`);
      await openProduction(page);
      await pickStep(page, "finish", /^Finish/);
      // Each row holds its words twice, the phone's and the table's, and CSS hides one: look at the shown one.
      await expect(page.getByText("Needs the Finish skill").filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText("Needs a skill you don't have")).toHaveCount(0);

      await page.getByRole("tablist", { name: "Production views" }).getByRole("tab", { name: "Board" }).click();
      if (size.width < 768) await page.getByLabel("Step", { exact: true }).selectOption("finish");
      await expect(page.getByRole("region", { name: "Finish", exact: true }).getByText("Needs the Finish skill").filter({ visible: true }).first()).toBeVisible();
    });
  });
}

test.describe("with a keyboard only", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /** Presses Tab until `matches` holds, as someone would, a bounded number of times. */
  async function tabTo(page: Page, matches: () => Promise<boolean>, limit = 60) {
    for (let n = 0; n < limit; n++) {
      if (await matches()) return;
      await page.keyboard.press("Tab");
    }
    throw new Error("never reached it with Tab");
  }

  const focused = (page: Page) => page.evaluate(() => ({ role: document.activeElement?.getAttribute("role") ?? document.activeElement?.tagName.toLowerCase(), label: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? "" }));

  test("picks a step, ticks a line and reaches Pass", async ({ page }) => {
    await openProduction(page);
    await page.getByRole("heading", { level: 1, name: "Production" }).click();
    // The Board and By step tabs come first; the step tabs follow.
    await tabTo(page, async () => {
      const at = await focused(page);
      return at.role === "tab" && at.label.startsWith("Print");
    });
    await expect(page.getByRole("tab", { name: /^Print/ })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: /^Finish/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: /^Finish/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("checkbox", { name: "Select #1041" })).toBeVisible();

    await tabTo(page, async () => (await focused(page)).label === "Select #1041");
    await page.keyboard.press("Space");
    await expect(page.getByRole("checkbox", { name: "Select #1041" })).toHaveAttribute("aria-checked", "true");
    await expect(bar(page).getByRole("button", { name: "Pass to Final QC" })).toBeEnabled();
    await tabTo(page, async () => (await focused(page)).label === "Pass to Final QC");
    await expect(bar(page).getByRole("button", { name: "Pass to Final QC" })).toBeFocused();
    await expect(page).toHaveURL(/\/production$/);
  });
});
