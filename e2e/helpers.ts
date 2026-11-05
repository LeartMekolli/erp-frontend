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

/** Waits for open and close animations to end, so checks see the page at rest rather than mid-fade. */
export async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
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
  const { overflow, culprits } = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // The innermost elements reaching past the screen's right edge, to say what to fix.
    // Content of a box that scrolls or clips sideways (the tabs row) can't widen the page.
    const clipped = (element: HTMLElement) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== "visible") return true;
      }
      return false;
    };
    const past = [...document.body.querySelectorAll<HTMLElement>("*")].filter(
      (element) => element.getBoundingClientRect().right > width + 0.5 && !clipped(element),
    );
    const innermost = past.filter((element) => !past.some((other) => other !== element && element.contains(other)));
    const describe = (element: HTMLElement) =>
      `${element.tagName.toLowerCase()}.${(element.getAttribute("class") ?? "").split(" ").slice(0, 4).join(".")} → ${Math.round(element.getBoundingClientRect().right)}px "${(element.textContent ?? "").trim().slice(0, 40)}"`;
    return {
      overflow: document.documentElement.scrollWidth - width,
      culprits: innermost.slice(0, 8).map(describe),
    };
  });
  expect(overflow, `Wider than the screen:\n${culprits.join("\n")}`).toBeLessThanOrEqual(0);
}
