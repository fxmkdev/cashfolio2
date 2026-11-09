import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import mutations from "../../vitest.mutations.config";
import providerUsageCleanup from "../../vitest.provider-usage-cleanup.config";
import stagingSeed from "../../vitest.staging-seed.config";
import {
  integrationSuiteOwners,
  integrationSuites,
} from "../../vitest.integration-suites";

describe("integration suite discovery", () => {
  it("assigns every integration file to exactly one environment", () => {
    const files = globSync("src/**/*.integration.ts", {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
    });
    expect(files.length).toBeGreaterThan(0);
    const configuredSuites = Object.fromEntries(
      Object.entries({ mutations, stagingSeed, providerUsageCleanup }).map(
        ([name, config]) => [
          name,
          { include: config.test!.include!, exclude: config.test!.exclude },
        ],
      ),
    );
    for (const file of files) {
      expect(integrationSuiteOwners(file, configuredSuites), file).toHaveLength(
        1,
      );
    }
  });

  it.each([
    ["src/server/new-domain/nested/new.integration.ts", "mutations"],
    ["src/auth/new.integration.ts", "mutations"],
    ["src/staging-seed/new.integration.ts", "stagingSeed"],
    ["src/staging-seed/nested/new.integration.ts", "stagingSeed"],
    ["src/provider-usage-cleanup/new.integration.ts", "providerUsageCleanup"],
    [
      "src/provider-usage-cleanup/nested/new.integration.ts",
      "providerUsageCleanup",
    ],
  ])("discovers newly added %s only in %s", (file, owner) => {
    expect(integrationSuiteOwners(file)).toEqual([owner]);
  });

  it("exposes omitted files when the general suite is narrowed", () => {
    expect(
      integrationSuiteOwners("src/new-domain/new.integration.ts", {
        ...integrationSuites,
        mutations: { include: ["src/server/**/*.integration.ts"] },
      }),
    ).toEqual([]);
  });

  it("exposes overlap when standalone exclusions are removed", () => {
    expect(
      integrationSuiteOwners("src/staging-seed/nested/new.integration.ts", {
        ...integrationSuites,
        mutations: { include: integrationSuites.mutations.include },
      }),
    ).toEqual(["mutations", "stagingSeed"]);
  });

  it.each(["src/server/new.test.ts", "src/staging-seed/fixture.ts"])(
    "does not discover non-integration file %s",
    (file) => expect(integrationSuiteOwners(file)).toEqual([]),
  );
});
