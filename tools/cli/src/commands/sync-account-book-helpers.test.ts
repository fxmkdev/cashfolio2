import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertNotGitHubActions,
  isExpectedConfirmation,
  readSyncAccountBookConfig,
  sortAccountGroupsParentFirst,
} from "./sync-account-book-helpers";

const VALID_ENV = {
  PROD_DATABASE_READONLY_URL: "postgresql://prod.example.test/db",
  STAGING_DATABASE_URL: "postgresql://staging.example.test/db",
  SYNC_ACCOUNT_BOOK_ID: "book-1",
  SYNC_TARGET_USER_EXTERNAL_ID: "user-1",
};

describe("readSyncAccountBookConfig", () => {
  it("returns trimmed config for required env vars", () => {
    const config = readSyncAccountBookConfig({
      ...VALID_ENV,
      SYNC_ACCOUNT_BOOK_ID: " book-1 ",
      SYNC_TARGET_USER_EXTERNAL_ID: " user-1 ",
    });

    assert.equal(config.accountBookId, "book-1");
    assert.equal(config.targetUserExternalId, "user-1");
    assert.equal(config.allowGitHubActions, false);
  });

  it("throws with all missing env var names", () => {
    assert.throws(
      () => readSyncAccountBookConfig({}),
      /PROD_DATABASE_READONLY_URL, STAGING_DATABASE_URL, SYNC_ACCOUNT_BOOK_ID, SYNC_TARGET_USER_EXTERNAL_ID/,
    );
  });

  it("rejects identical source and target URLs", () => {
    assert.throws(
      () =>
        readSyncAccountBookConfig({
          ...VALID_ENV,
          STAGING_DATABASE_URL: VALID_ENV.PROD_DATABASE_READONLY_URL,
        }),
      /must be different/,
    );
  });

  it("rejects non-postgres URLs", () => {
    assert.throws(
      () =>
        readSyncAccountBookConfig({
          ...VALID_ENV,
          STAGING_DATABASE_URL: "https://example.test",
        }),
      /Invalid target database URL/,
    );
  });
});

describe("assertNotGitHubActions", () => {
  it("rejects GitHub Actions without override", () => {
    assert.throws(
      () => assertNotGitHubActions({ GITHUB_ACTIONS: "true" }, false),
      /Refusing to run in GitHub Actions/,
    );
  });

  it("allows GitHub Actions with override", () => {
    assert.doesNotThrow(() =>
      assertNotGitHubActions({ GITHUB_ACTIONS: "true" }, true),
    );
  });
});

describe("isExpectedConfirmation", () => {
  it("accepts exact replacement confirmation after trimming whitespace", () => {
    assert.equal(isExpectedConfirmation(" replace book-1\n", "book-1"), true);
  });

  it("rejects other confirmations", () => {
    assert.equal(isExpectedConfirmation("book-1", "book-1"), false);
  });
});

describe("sortAccountGroupsParentFirst", () => {
  it("orders parent groups before children", () => {
    const sorted = sortAccountGroupsParentFirst([
      { id: "grandchild", parentGroupId: "child" },
      { id: "sibling", parentGroupId: "root" },
      { id: "root", parentGroupId: null },
      { id: "child", parentGroupId: "root" },
    ]);

    assert.deepEqual(
      sorted.map((group) => group.id),
      ["root", "child", "sibling", "grandchild"],
    );
  });

  it("throws for cycles", () => {
    assert.throws(
      () =>
        sortAccountGroupsParentFirst([
          { id: "a", parentGroupId: "b" },
          { id: "b", parentGroupId: "a" },
        ]),
      /Unable to order account groups/,
    );
  });
});
