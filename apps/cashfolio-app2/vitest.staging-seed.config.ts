import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { integrationSuites } from "./vitest.integration-suites.ts";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    ...integrationSuites.stagingSeed,
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
