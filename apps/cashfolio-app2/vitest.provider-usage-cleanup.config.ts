import { defineConfig } from "vitest/config";
import { integrationSuites } from "./vitest.integration-suites.ts";

export default defineConfig({
  test: {
    environment: "node",
    ...integrationSuites.providerUsageCleanup,
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
