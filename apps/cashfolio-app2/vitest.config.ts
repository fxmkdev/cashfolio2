import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const fallback = fileURLToPath(
  import.meta.resolve("temporal-polyfill/implementation"),
);

export default defineConfig({
  test: {
    // Worker limits are global; unit scripts use their separate config.
    maxWorkers: 1,
    projects: [
      "./vitest.unit.config.ts",
      "./vitest.storybook.config.ts",
      ...["UTC", "Europe/Zurich", "America/Los_Angeles"].flatMap((timezoneId) =>
        (["native", "polyfill"] as const).map((mode) => ({
          resolve: {
            alias: [
              { find: "@", replacement: sourceRoot },
              ...(mode === "polyfill"
                ? [{ find: /^temporal-polyfill$/, replacement: fallback }]
                : []),
            ],
          },
          test: {
            name: `temporal-${mode}-${timezoneId}`,
            provide: { temporalMode: mode },
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
              instances: [{ browser: "chromium" as const }],
            },
          },
        })),
      ),
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage-storybook",
    },
  },
});
