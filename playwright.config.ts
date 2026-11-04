import { defineConfig, devices, type Project } from "@playwright/test";

import { APP_URL, FAKE_URL } from "./e2e/urls";

/** The screen sizes every page is checked at (spec §9): phones, a phone on its side, tablets, desktops. */
const SIZES = [
  [320, 640],
  [390, 844],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const;

// Layout and accessibility at every size; the sign-in and session flows on a
// desktop and on Safari at phone size.
const sizeProjects: Project[] = SIZES.map(([width, height]) => ({
  name: `chromium-${width}x${height}`,
  testMatch: /a11y\.spec\.ts/,
  use: { ...devices["Desktop Chrome"], viewport: { width, height } },
}));

export default defineConfig({
  testDir: "e2e",
  // One fake erp-api serves every test and each test starts its data over, so tests run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: { baseURL: APP_URL, trace: "retain-on-failure" },
  projects: [
    ...sizeProjects,
    {
      name: "chromium-flows",
      testIgnore: /a11y\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    { name: "webkit-390x844", use: { ...devices["Desktop Safari"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "npm run fake-api",
      url: `${FAKE_URL}/__link`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // A production build on its own port, so a running `npm run dev` (3001, real erp-api) is left alone.
      command: `next build && next start -p ${new URL(APP_URL).port}`,
      url: `${APP_URL}/sign-in`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        ERP_API_URL: FAKE_URL,
        NEXT_PUBLIC_ERP_API_URL: FAKE_URL,
        // 32 bytes of 0x01, base64: a fixed key for the fake erp-api only.
        SESSION_SECRET: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
      },
    },
  ],
});
