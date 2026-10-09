import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["./vitest.unit.config.ts", "./vitest.storybook.config.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage-storybook",
    },
  },
});
