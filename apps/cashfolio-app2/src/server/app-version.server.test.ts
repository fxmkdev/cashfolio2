import { describe, expect, test } from "vitest";
import { resolveAppVersion } from "./app-version.server";

describe("resolveAppVersion", () => {
  test("prefers npm_package_version from the runtime environment", async () => {
    await expect(
      resolveAppVersion({
        env: { npm_package_version: " 1.2.3 " },
        packageJsonPaths: ["/unused/package.json"],
        readPackageJson: async () => {
          throw new Error("package.json should not be read");
        },
      }),
    ).resolves.toBe("1.2.3");
  });

  test("falls back to package metadata from the runtime filesystem", async () => {
    await expect(
      resolveAppVersion({
        env: {},
        packageJsonPaths: ["/app/apps/cashfolio-app2/package.json"],
        readPackageJson: async () => JSON.stringify({ version: "2.3.4" }),
      }),
    ).resolves.toBe("2.3.4");
  });

  test("returns unknown when no valid version is available", async () => {
    await expect(
      resolveAppVersion({
        env: { npm_package_version: " " },
        packageJsonPaths: [
          "/app/package.json",
          "/app/apps/cashfolio-app2/package.json",
        ],
        readPackageJson: async (filePath) => {
          if (filePath.endsWith("package.json")) {
            return JSON.stringify({ name: "cashfolio-app2" });
          }

          throw new Error("missing file");
        },
      }),
    ).resolves.toBe("unknown");
  });
});
