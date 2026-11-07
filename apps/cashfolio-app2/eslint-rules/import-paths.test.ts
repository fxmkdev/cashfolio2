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
  ])("recognizes source-relative support %s", (file) => {
    const sourceRoot = resolve("/work/cashfolio/src");
    expect(isTestSupport(resolve(sourceRoot, file), sourceRoot)).toBe(true);
  });
});
