import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __E2E_BUILD__: "false" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Preserve Vitest 4 mock-history behavior across tests.
    clearMocks: false,
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "dist/**", "src/**/*.browser.test.tsx"],
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public",
    },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage",
    },
  },
});
