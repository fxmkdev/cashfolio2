/// <reference types="vitest/config" />
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [!isStorybook() && reactRouter(), tsconfigPaths()],
  test: {
    setupFiles: "./test-setup.ts",
    maxWorkers: 1,
  },
});

function isStorybook() {
  return process.argv[1]?.includes("storybook");
}
