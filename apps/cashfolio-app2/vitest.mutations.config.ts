import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: [
      "src/server/account-book-mutation.integration.ts",
      "src/server/admin-mutation.integration.ts",
      "src/server/period/base-data/period-base-data-snapshot.integration.ts",
    ],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
