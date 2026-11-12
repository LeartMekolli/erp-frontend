import type { Page } from "@playwright/test";

import { STAFF } from "../test/fake-erp-api/seed";

import { expect, signIn, test } from "./helpers";

// Desktop flows: phones are covered by `a11y.spec.ts` at every size.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop flows");

/** The fake's order ids (`orders-seed.ts`). */
const orderId = (number: number) => `22222222-0000-4000-8000-${String(number).padStart(12, "0")}`;

async function signedIn(page: Page) {
  await signIn(page, STAFF.email);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
}

async function openOrder(page: Page, number: number) {
  await signedIn(page);
  await page.goto(`/orders/${orderId(number)}`);
  await expect(page.getByRole("heading", { level: 1, name: `#${number}` })).toBeVisible();
}

const strip = (page: Page) => page.getByRole("list", { name: "Progress through the steps" });
const stripStep = (page: Page, index: number) => strip(page).getByRole("listitem").nth(index);
const section = (page: Page, name: RegExp) => page.getByRole("button", { name });
const tick = (page: Page, label: string) => page.getByRole("checkbox", { name: `Select ${label}` }).click();

test("an order opens from the list", async ({ page }) => {
  await signedIn(page);
  await page.getByRole("row", { name: /#1048\b/ }).getByRole("link", { name: "#1048" }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId(1048)}$`));
  await expect(page.getByRole("heading", { level: 1, name: "#1048" })).toBeVisible();
  await expect(page.getByRole("region", { name: "12 × Ring band" }).getByText("Brass")).toBeVisible();
});

test("pieces pass a step with its checklist and a photo", async ({ page }) => {
  await openOrder(page, 1048);
  await expect(stripStep(page, 1)).toContainText("4 Finish");
  await section(page, /^Finish\b/).click();
  await tick(page, "3/12");
  await tick(page, "4/12");
  await expect(page.getByRole("region", { name: "Selected pieces" })).toContainText("2 pieces at Finish");

  const pass = page.getByRole("button", { name: "Pass to Final QC" });
  await expect(pass).toBeEnabled();
  await pass.click();
  const dialog = page.getByRole("dialog", { name: "Pass 2 pieces at Finish" });
  await expect(dialog.getByText("This counts for Northcast Foundry")).toBeVisible();
  await dialog.getByRole("group", { name: "Surface smooth" }).getByRole("radio", { name: "Yes" }).check();
  await dialog.getByLabel("Photos").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("photo") });
  await expect(dialog.getByRole("button", { name: "Remove photo.jpg" })).toBeVisible();
  await dialog.getByRole("button", { name: "Pass to Final QC" }).click();

  await expect(page.getByText("2 pieces passed to Final QC.")).toBeVisible();
  await expect(stripStep(page, 1)).toContainText("2 Finish");
  await expect(stripStep(page, 2)).toContainText("5 Final QC");
  await expect(page.getByRole("region", { name: "Selected pieces" })).toHaveCount(0);
});

test("a failed piece goes back with its defect, and its history shows it", async ({ page }) => {
  await openOrder(page, 1048);
  await section(page, /^Final QC\b/).click();
  await tick(page, "7/12");
  const fail = page.getByRole("button", { name: "Fail…" });
  await expect(fail).toBeEnabled();
  await fail.click();
  const dialog = page.getByRole("dialog", { name: "Fail 1 piece at Final QC" });
  await dialog.getByLabel("Defect").selectOption({ label: "Porosity" });
  await expect(dialog.getByText("Goes back to Finish to be redone")).toBeVisible();
  await dialog.getByLabel("Comment").fill("Pitted on the inside");
  await dialog.getByRole("button", { name: "Fail", exact: true }).click();

  await expect(page.getByText("1 piece failed at Final QC.")).toBeVisible();
  await expect(stripStep(page, 1)).toContainText("5 Finish");
  await expect(stripStep(page, 1)).toContainText("2 being redone");

  await section(page, /^Finish\b/).click();
  await page.getByRole("link", { name: "History of 7/12" }).click();
  await expect(page).toHaveURL(/\?piece=/);
  const panel = page.getByRole("dialog", { name: "Piece 7/12" });
  await expect(panel.getByText("Being redone at Finish")).toBeVisible();
  await expect(panel.getByText("Pitted on the inside")).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId(1048)}$`));
  await expect(panel).toHaveCount(0);
});

test("a line goes to a partner and the offer shows on it", async ({ page }) => {
  await openOrder(page, 1049);
  const line = page.getByRole("region", { name: "8 × Roof truss" });
  await expect(line.getByText("In-house")).toBeVisible();
  await line.getByRole("button", { name: "Send to partner" }).click();
  const dialog = page.getByRole("dialog", { name: "Send 8 × Roof truss to a partner" });
  await dialog.getByRole("radio", { name: /Layerline Prints/ }).check();
  await dialog.getByRole("button", { name: "Send offer" }).click();

  await expect(line.getByText("Offered to Layerline Prints.")).toBeVisible();
  await expect(line.getByText(/^Offered, answer by /)).toBeVisible();
  await expect(line.getByRole("button", { name: "Withdraw offer" })).toBeVisible();
});

test("a failed check shows on the Quality tab", async ({ page }) => {
  await openOrder(page, 1048);
  await expect(page.getByRole("tab", { name: "Quality 2 failed" })).toBeVisible();
  await section(page, /^Final QC\b/).click();
  await tick(page, "7/12");
  await page.getByRole("button", { name: "Fail…" }).click();
  const dialog = page.getByRole("dialog", { name: "Fail 1 piece at Final QC" });
  await dialog.getByLabel("Defect").selectOption({ label: "Porosity" });
  await dialog.getByLabel("Comment").fill("Pitted on the inside");
  await dialog.getByRole("button", { name: "Fail", exact: true }).click();
  await expect(page.getByText("1 piece failed at Final QC.")).toBeVisible();

  await page.getByRole("tab", { name: "Quality 3 failed" }).click();
  const card = page.getByRole("article", { name: "Final QC" });
  await expect(card.getByText("2 failed", { exact: true })).toBeVisible();
  await expect(card.getByRole("list", { name: "Defects at Final QC" })).toContainText("Porosity");
  await expect(card.getByText("Latest check by Ana Ruiz")).toBeVisible();
});

test("a fail shows on the History tab", async ({ page }) => {
  await openOrder(page, 1048);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("button", { name: "Fails and moves back 2" })).toBeVisible();
  await page.getByRole("tab", { name: "Pieces" }).click();
  await section(page, /^Final QC\b/).click();
  await tick(page, "7/12");
  await page.getByRole("button", { name: "Fail…" }).click();
  const dialog = page.getByRole("dialog", { name: "Fail 1 piece at Final QC" });
  await dialog.getByLabel("Defect").selectOption({ label: "Porosity" });
  await dialog.getByLabel("Comment").fill("Pitted on the inside");
  await dialog.getByRole("button", { name: "Fail", exact: true }).click();
  await expect(page.getByText("1 piece failed at Final QC.")).toBeVisible();

  // The move refreshes the timeline without a reload.
  await page.getByRole("tab", { name: "History" }).click();
  const today = page.getByRole("list", { name: "Moves on Today" });
  await expect(today.getByRole("listitem").first()).toContainText("Failed at Final QC: Porosity");
  await expect(today.getByRole("listitem").first()).toContainText("Pitted on the inside");
  await expect(page.getByRole("button", { name: "Fails and moves back 3" })).toBeVisible();
});

test("a comment posts for staff only unless another reader is picked", async ({ page }) => {
  await openOrder(page, 1049);
  const comments = page.getByRole("region", { name: "Comments" });
  await expect(comments.getByText("Only staff will read this")).toBeVisible();
  await comments.getByLabel("Add a comment").fill("Check the finish first");
  await comments.getByRole("button", { name: "Post comment" }).click();
  const posted = comments.getByRole("list", { name: "Comments" }).getByRole("listitem").filter({ hasText: "Check the finish first" });
  await expect(posted.getByText("Staff only")).toBeVisible();

  await comments.getByLabel("Who reads it").selectOption({ label: "The customer" });
  await expect(comments.getByText("The customer will read this")).toBeVisible();
  await comments.getByLabel("Add a comment").fill("Ready on Friday");
  await comments.getByRole("button", { name: "Post comment" }).click();
  const toCustomer = comments.getByRole("list", { name: "Comments" }).getByRole("listitem").filter({ hasText: "Ready on Friday" });
  await expect(toCustomer.getByText("To the customer")).toBeVisible();
});

test("an order is cancelled with a reason", async ({ page }) => {
  await openOrder(page, 1046);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel order" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel #1046" });
  await dialog.getByLabel("Reason").fill("Customer changed their mind");
  await dialog.getByRole("button", { name: "Cancel order" }).click();

  await expect(page.getByText("#1046 cancelled.")).toBeVisible();
  await expect(page.getByText(/Customer changed their mind/)).toBeVisible();
  await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0);
});
