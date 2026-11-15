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
