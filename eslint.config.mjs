import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/partner-portal/**", "src/components/partner/**", "src/lib/partner-jobs/**", "src/lib/partner-earnings/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api/client",
              importNames: ["api"],
              message: "Partner pages use partnerApi: partners never call staff routes.",
            },
          ],
        },
      ],
    },
  },
  {
    // Shared by staff and partners: each area passes its data and actions in.
    files: ["src/components/production/**"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api/client",
              importNames: ["api", "partnerApi"],
              message: "Shared production views take their data as props: each area fetches its own.",
            },
            {
              name: "@/lib/auth/permissions",
              message: "Shared production views take what a person may do as props: staff permissions don't apply to partners.",
            },
          ],
        },
      ],
    },
  },
  {
    // Shared by staff and partners: each area passes its data and actions in.
    files: ["src/components/earnings/**", "src/lib/payouts/**"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api/client",
              importNames: ["api", "partnerApi"],
              message: "Shared earnings views take their data as props: each area fetches its own.",
            },
          ],
        },
      ],
    },
  },
  {
    // An address is only the page: no `?` part (CLAUDE.md § Addresses). What's on screen is React state;
    // a one-time message travels in an arrival note or the auth note. Only the return from payout setup
    // reads the `?onboarding=` the payment provider adds. `no-restricted-syntax`, because the blocks above
    // set `no-restricted-imports` and flat config would let one replace the other.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "src/components/partner/earnings/payout-return.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportSpecifier[imported.name='useSearchParams']",
          message: "Keep what's on screen in React state, not the address (CLAUDE.md § Addresses).",
        },
        {
          selector: "Identifier[name='searchParams']",
          message: "Pages don't read a `?` part: pass one-time messages with an arrival note or the auth note (CLAUDE.md § Addresses).",
        },
        {
          selector: "Literal[value=/\\?[a-z_]+=/]",
          message: "An address is only the page: no `?key=` part (CLAUDE.md § Addresses).",
        },
        {
          selector: "TemplateElement[value.raw=/\\?[a-z_]+=/]",
          message: "An address is only the page: no `?key=` part (CLAUDE.md § Addresses).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright's reports and traces: built code, not ours.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
