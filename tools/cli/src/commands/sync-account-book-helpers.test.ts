import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertNotGitHubActions,
  hasGainLossAccount,
  isExpectedConfirmation,
  readSyncAccountBookConfig,
  withoutAccountGroupParentIds,
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

describe("withoutAccountGroupParentIds", () => {
  it("returns copies with parent group IDs cleared", () => {
    const groups = [
      { id: "child", parentGroupId: "root" },
      { id: "root", parentGroupId: null },
    ];
    const result = withoutAccountGroupParentIds(groups);

    assert.deepEqual(result, [
      { id: "child", parentGroupId: null },
      { id: "root", parentGroupId: null },
    ]);
    assert.equal(groups[0]!.parentGroupId, "root");
  });
});

describe("hasGainLossAccount", () => {
  it("returns true when an equity gain/loss account is present", () => {
    assert.equal(
      hasGainLossAccount([
        { type: "ASSET", equityAccountSubtype: null },
        { type: "EQUITY", equityAccountSubtype: "GAIN_LOSS" },
      ]),
      true,
    );
  });

  it("returns false for other equity subtypes", () => {
    assert.equal(
      hasGainLossAccount([
        { type: "EQUITY", equityAccountSubtype: "OPENING_BALANCES" },
        { type: "ASSET", equityAccountSubtype: "GAIN_LOSS" },
      ]),
      false,
    );
  });
});
