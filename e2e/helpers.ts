import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

import { FAKE_PASSWORD, WORKSPACE } from "../test/fake-erp-api/seed";

import { FAKE_URL } from "./urls";

/** Every test starts the fake erp-api's data over. */
export const test = base.extend<{ freshFake: void }>({
  freshFake: [
    async ({ request }, use) => {
      await request.post(`${FAKE_URL}/__reset`);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

export async function signIn(page: Page, email: string, { password = FAKE_PASSWORD, path = "/sign-in" } = {}) {
  await page.goto(path);
  await page.getByLabel("Workspace").fill(WORKSPACE);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** AMI's alert with this text. Next.js adds an empty `role="alert"` of its own, the route announcer. */
export function alert(page: Page, text: string) {
  return page.getByRole("alert").filter({ hasText: text });
}

/** WCAG 2.2 AA, the level the spec commits to. */
export async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Reflow: nothing wider than the screen (WCAG 1.4.10). */
export async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
