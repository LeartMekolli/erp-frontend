import type { Locator, Page } from "@playwright/test";

import { STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";

// Each size is set below; Safari at phone size would repeat the 375 run.
test.skip(({ browserName }) => browserName === "webkit", "sizes are set per block");

/** A step's column (or Scrap), by its exact name. */
const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const head = (page: Page, name: string) => column(page, name).getByRole("heading", { level: 2 });

async function openBoard(page: Page, { clock = true } = {}) {
  // The 5 seconds a pass waits are skipped with the clock, not waited out.
  if (clock) await page.clock.install();
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.goto("/production");
  await expect(page.getByRole("tablist", { name: "Production views" }).getByRole("tab", { name: "Board" })).toHaveAttribute("aria-selected", "true");
  await expect(head(page, "Print")).toHaveText(/Print\s*26/);
  await expect(column(page, "Print").getByRole("button", { name: "Move #1041…" })).toBeEnabled();
}

/** Drags with the mouse, in small steps past dnd-kit's 6 px start, from the handle to the middle of `to`. */
async function drag(page: Page, handle: Locator, to: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 4 });
  const box = (await to.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 120), { steps: 12 });
}

/** A pass of #1041's 10 pieces is waiting at Finish; after the 5 seconds it's sent and Finish counts them. */
async function expectHeldThenSent(page: Page) {
  const undo = column(page, "Finish").getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();
  await expect(column(page, "Finish").getByText("Passing to Finish…")).toBeVisible();
  await expect(head(page, "Print")).toHaveText(/Print\s*26/);
  await page.clock.fastForward(5_000);
  await expect(page.getByText("10 pieces passed to Finish.")).toBeVisible();
  await expect(head(page, "Finish")).toHaveText(/Finish\s*34/);
  await expect(head(page, "Print")).toHaveText(/Print\s*16/);
  await expect(undo).toHaveCount(0);
}

for (const width of [768, 1280] as const) {
  test.describe(`dragging at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("drags #1041 from Print onto Finish: it waits with Undo, then passes", async ({ page }) => {
      await openBoard(page);
      await drag(page, column(page, "Print").getByRole("button", { name: "Drag #1041" }), column(page, "Finish"));
      await expect(column(page, "Finish").getByText("Pass here")).toBeVisible();
      await page.mouse.up();
      await expectHeldThenSent(page);
      await expect(page).toHaveURL(/\/production$/);
    });
  });
}

test.describe("dragging at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("drags #1048 back from Final QC onto Finish: the send-back dialog", async ({ page }) => {
    await openBoard(page);
    await drag(page, column(page, "Final QC").getByRole("button", { name: "Drag #1048" }), column(page, "Finish"));
    await expect(column(page, "Finish").getByText("Send back here")).toBeVisible();
    await page.mouse.up();
    await expect(page.getByRole("dialog", { name: "Send 3 pieces back to Finish" })).toBeVisible();
  });

  test("lights up only where a card may go, and a drop anywhere else does nothing", async ({ page }) => {
    await openBoard(page);
    await drag(page, column(page, "Print").getByRole("button", { name: "Drag #1041" }), column(page, "Final QC"));
    await expect(column(page, "Finish").getByText("Pass here")).toBeVisible();
    await expect(column(page, "Final QC").getByText(/here$/)).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    await expect(head(page, "Print")).toHaveText(/Print\s*26/);
  });

  test("drags with the keyboard: Space, an arrow key, Space", async ({ page }) => {
    // Sending the held pass is covered by the mouse drags; here it's undone.
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await openBoard(page, { clock: false });
    const handle = column(page, "Print").getByRole("button", { name: "Drag #1041" });
    await handle.focus();
    await page.keyboard.press("Space");
    // What dnd-kit announces says where the drag is at each step.
    await expect(page.getByText("Picked up #1041, 10 pieces.")).toBeAttached();
    await expect(column(page, "Finish").getByText("Pass here")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Over Finish: pass.")).toBeAttached();
    await page.keyboard.press("Space");
    await expect(page.getByText("Dropped on Finish.")).toBeAttached();
    expect(errors).toEqual([]);
    const undo = column(page, "Finish").getByRole("button", { name: "Undo" });
    await expect(undo).toBeVisible();
    await expect(column(page, "Finish").getByText("Passing to Finish…")).toBeVisible();
    await undo.click();
    await expect(page.getByText("Undone. #1041 stays where it was.")).toBeVisible();
  });

  test("sends a waiting pass at once when the person switches to By step", async ({ page }) => {
    await openBoard(page);
    await column(page, "Print").getByRole("button", { name: "Move #1041…" }).click();
    await page.getByRole("menuitem", { name: "Pass to Finish" }).click();
    await expect(column(page, "Finish").getByRole("button", { name: "Undo" })).toBeVisible();
    const sent = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/workflow/moves"));
    await page.getByRole("tablist", { name: "Production views" }).getByRole("tab", { name: "By step" }).click();
    await sent;
    await expect(page.getByRole("tab", { name: /^Finish/ })).toHaveText(/Finish\s*34/);
    await expect(page).toHaveURL(/\/production$/);
  });
});

test.describe("at 375 px (phone)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("shows one step at a time: a swipe or the picker moves between them", async ({ page }) => {
    await openBoard(page);
    const picker = page.getByLabel("Step", { exact: true });
    await expect(picker).toHaveValue("print");
    const print = column(page, "Print");
    const box = (await print.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await page.mouse.wheel(box.width, 0);
    await expect(picker).toHaveValue("finish");
    await picker.selectOption("final_qc");
    await expect(head(page, "Final QC")).toBeInViewport();
    await expect(page).toHaveURL(/\/production$/);
  });

  test("moves a card through Move to…, with no drag handles", async ({ page }) => {
    await openBoard(page);
    await expect(page.getByRole("button", { name: /^Drag / })).toHaveCount(0);
    await page.getByLabel("Step", { exact: true }).selectOption("finish");
    await column(page, "Finish").getByRole("button", { name: "Move #1041…" }).click();
    await page.getByRole("menuitem", { name: "Pass to Final QC" }).click();
    await expect(page.getByRole("dialog", { name: "Pass 20 pieces at Finish" })).toBeVisible();
  });
});
