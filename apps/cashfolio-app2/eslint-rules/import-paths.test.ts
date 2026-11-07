import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isTestSupport } from "./import-paths";

describe("test support ownership", () => {
  it.each(["stories", "testing", "fixtures", "test-support", "__tests__"])(
    "ignores checkout ancestors named %s",
    (ancestor) => {
      const sourceRoot = resolve("/work", ancestor, "cashfolio/src");
      expect(
        isTestSupport(resolve(sourceRoot, "server/accounts.ts"), sourceRoot),
      ).toBe(false);
      expect(
        isTestSupport(
          resolve(sourceRoot, "components/account-management/view.tsx"),
          sourceRoot,
        ),
      ).toBe(false);
      expect(
        isTestSupport(
          resolve(sourceRoot, "server/test-support/deferred.ts"),
          sourceRoot,
        ),
      ).toBe(true);
    },
  );

  it.each([
    "stories/fixture.ts",
    "testing/fixture.ts",
    "fixtures/rows.ts",
    "test-support/deferred.ts",
    "__tests__/example.ts",
    "server/accounts.test.ts",
    "components/page.story-harness.tsx",
    "components/page.story.tsx",
    "components/storybook.ts",
    "components/page.spec.tsx",
    "components/fixtures.ts",
    "components/account-fixtures.ts",
    "components/account-test-fixtures/rows.ts",
    "components/account-story-helpers/rows.ts",
    "components/test-harness/render.tsx",
    "server/test-setup/database.ts",
  ])("recognizes source-relative support %s", (file) => {
    const sourceRoot = resolve("/work/cashfolio/src");
    expect(isTestSupport(resolve(sourceRoot, file), sourceRoot)).toBe(true);
  });
  it.each([
    "server/transactions/transactions-helpers.server.ts",
    "server/period/period-helpers.ts",
    "shared/accounts/account-validation.ts",
    "components/specifications.ts",
    "components/latest-values.ts",
    "e2e/provider-mocks.server.ts",
  ])("keeps production helper %s inside the boundary checks", (file) => {
    const sourceRoot = resolve("/work/cashfolio/src");
    expect(isTestSupport(resolve(sourceRoot, file), sourceRoot)).toBe(false);
  });
});
