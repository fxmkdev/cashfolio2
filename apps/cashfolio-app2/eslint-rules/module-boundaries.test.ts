import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint({
  cwd: fileURLToPath(new URL("../", import.meta.url)),
});
async function messages(code: string, filePath = "src/components/example.tsx") {
  const [result] = await eslint.lintText(code, { filePath });
  expect(result.fatalErrorCount).toBe(0);
  return result.messages
    .filter((message) => message.ruleId === "cashfolio/module-boundaries")
    .map((message) => message.messageId);
}
const forms = (target: string) => [
  `import { value } from "${target}";`,
  `import type { Value } from "${target}";`,
  `import { type Value } from "${target}";`,
  `export { value } from "${target}";`,
  `export type { Value } from "${target}";`,
  `export * from "${target}";`,
  `export type * from "${target}";`,
  `void import("${target}");`,
  `void import(\`${target}\`);`,
  `type Value = import("${target}").Value;`,
  `const value = require("${target}");`,
  `import value = require("${target}");`,
];

describe("configured module boundaries", () => {
  beforeAll(async () => {
    await eslint.calculateConfigForFile("src/components/example.tsx");
  }, 30_000);
  it.each(forms("@/routes/$accountBookId/report/-page-view"))(
    "rejects route-private dependency: %s",
    async (code) => {
      expect(await messages(code)).toEqual(["routePrivate"]);
    },
  );
  it.each(forms("@/server/accounts/accounts-queries"))(
    "rejects facade bypass: %s",
    async (code) => {
      expect(await messages(code)).toEqual(["serverFacade"]);
    },
  );
  it.each(forms("@/components/testing/storybook-fixtures"))(
    "rejects support dependency: %s",
    async (code) => {
      expect(await messages(code)).toEqual(["testSupport"]);
    },
  );
  it.each([
    "@/server/resource-context.server",
    "@/prisma.server",
    "@/auth/functions.server",
    "../server/accounts/../input-validation",
    "../server/valuation/rate-lookups.server.ts",
  ])("rejects private server target %s", async (target) => {
    expect(await messages(`import type { Value } from "${target}";`)).toEqual([
      "serverFacade",
    ]);
  });
  it.each([
    "@/server/test-support/deferred",
    "@/server/accounts/gain-loss/recorded.test-support",
    "@/components/account-management/grid/column-test-fixtures",
    "@/components/grid/row-actions-menu.story-helpers",
    "@/components/account-management/stories/harness",
    "@/storybook-test-utils",
    "@/shared/accounts/account-utils.test",
    "@/server/accounts/settings/test-setup",
    "@/components/testing",
    "@/server/test-support",
    "@/components/fixtures/example",
    "@/components/story-fixtures/example",
    "@/components/account-test-fixtures/rows",
    "@/components/account-story-helpers/rows.ts",
    "@/components/fixtures.ts",
    "@/components/account-fixtures",
    "@/shared/accounts/account-utils.spec.ts",
    "../components/account-test-fixtures/../account-test-fixtures/rows",
  ])("rejects support target %s", async (target) => {
    expect(
      await messages(
        `import { value } from "${target}";`,
        "src/server/example.ts",
      ),
    ).toContain("testSupport");
  });
  it.each([
    ["src/routes/$accountBookId/report/route.tsx", "./-page-view"],
    ["src/routes/$accountBookId/report/detail/route.tsx", "../-page-view"],
    [
      "src/routes/$accountBookId/report/-breakdown/view.ts",
      "../-selector/model",
    ],
    ["src/routes/$accountBookId/report/route.tsx", "../-period-filter-action"],
    ["src/routes/admin/route.tsx", "../-user-menu"],
    ["src/components/example.tsx", "@/server/accounts"],
    ["src/hooks/example.ts", "@/server/period-history"],
    ["src/components/example.tsx", "@/server/user-profile.ts"],
    ["src/components/example.tsx", "@/shared/accounts/account-options"],
    ["src/components/example.tsx", "@/components/charts/dashboard-chart-theme"],
    ["src/components/example.tsx", "some-package/routes/-private"],
    ["src/server/example.ts", "@/server/accounts/accounts-queries"],
    ["src/server/example.ts", "@/prisma.server"],
    ["src/auth/example.server.ts", "@/server/accounts/accounts-queries"],
    ["src/server.tsx", "@/server/resource-context.server"],
    ["src/routes/api/example.tsx", "@/auth/functions.server"],
    ["src/components/example.test.ts", "@/routes/admin/-admin-shell"],
    ["src/components/example.spec.tsx", "@/routes/admin/-admin-shell"],
    [
      "src/components/account-test-fixtures/rows.ts",
      "@/components/testing/storybook-fixtures",
    ],
    [
      "src/components/example.integration.ts",
      "@/server/accounts/accounts-queries",
    ],
    [
      "src/components/example.stories.tsx",
      "@/server/accounts/accounts-queries",
    ],
    ["src/components/example.story-harness.tsx", "@/routes/admin/-admin-shell"],
    [
      "src/components/example-test-fixtures.ts",
      "@/components/testing/storybook-fixtures",
    ],
    ["src/server/example.server.ts", "@/e2e/provider-mocks.server"],
  ])("permits %s importing %s", async (file, target) => {
    expect(await messages(`import { value } from "${target}";`, file)).toEqual(
      [],
    );
  });
  it.each([
    ["src/routes/$accountBookId/history/route.tsx", "../report/-page-view"],
    ["src/routes/$accountBookId/route.tsx", "./report/-page-view"],
    ["src/routes/reporting/route.tsx", "../report/-parts/view"],
    [
      "src/components/example.tsx",
      "@/routes/admin/../$accountBookId/report/-parts/view",
    ],
    ["src/hooks/example.ts", "../routes/$accountBookId/report/-page-view"],
  ])("rejects cross-owner import from %s to %s", async (file, target) => {
    expect(await messages(`import { value } from "${target}";`, file)).toEqual([
      "routePrivate",
    ]);
  });
});
