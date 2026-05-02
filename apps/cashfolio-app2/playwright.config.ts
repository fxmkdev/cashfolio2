import { defineConfig, devices } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public";
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const workers = process.env.CI
  ? Number.parseInt(process.env.E2E_WORKERS ?? "2", 10)
  : 1;

export default defineConfig({
  testDir: "./e2e/tests",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: Number.isFinite(workers) && workers > 0 ? workers : 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results",
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ],
  use: {
    baseURL: baseUrl,
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.CI ? "on-first-retry" : "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173",
    url: baseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      BASE_URL: baseUrl,
      E2E_TEST_MODE: process.env.E2E_TEST_MODE ?? "true",
      E2E_AUTH_BYPASS: process.env.E2E_AUTH_BYPASS ?? "true",
      E2E_AUTH_EXTERNAL_ID: process.env.E2E_AUTH_EXTERNAL_ID ?? "e2e-user",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
