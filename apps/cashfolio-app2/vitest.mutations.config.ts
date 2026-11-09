import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { integrationSuites } from "./vitest.integration-suites.ts";

export default defineConfig({
  define: { __E2E_BUILD__: "false" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    ...integrationSuites.mutations,
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
