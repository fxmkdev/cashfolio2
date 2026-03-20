import { defineConfig, devices } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public";
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results",
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ],
  use: {
    baseURL: baseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
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
