import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Worker limits are global; unit scripts use their separate config.
    maxWorkers: 1,
    projects: ["./vitest.unit.config.ts", "./vitest.storybook.config.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage-storybook",
    },
  },
});
