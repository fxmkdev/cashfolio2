import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const fallback = fileURLToPath(
  import.meta.resolve("temporal-polyfill/implementation"),
);

export default defineConfig({
  test: {
    maxWorkers: 1,
    projects: ["UTC", "Europe/Zurich", "America/Los_Angeles"].flatMap(
      (timezoneId) =>
        (["chromium", "webkit"] as const).map((browser) => ({
          resolve: {
            alias: [
              { find: "@", replacement: sourceRoot },
              // WebKit previews can expose Temporal before stable Safari does.
              // Force the implementation so this remains a fallback-path test.
              ...(browser === "webkit"
                ? [{ find: /^temporal-polyfill$/, replacement: fallback }]
                : []),
            ],
          },
          test: {
            name: `temporal-${browser}-${timezoneId}`,
            include: [
              "src/shared/date.test.ts",
              "src/shared/period.test.ts",
              "src/shared/temporal.browser.test.tsx",
            ],
            browser: {
              enabled: true,
              provider: playwright({ contextOptions: { timezoneId } }),
              headless: true,
              screenshotFailures: true,
              instances: [{ browser }],
            },
          },
        })),
    ),
  },
});
