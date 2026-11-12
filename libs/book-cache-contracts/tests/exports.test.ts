import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("compiled public exports run without workspace source or TypeScript support", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "book-cache-contracts-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const installedPackage = join(
    directory,
    "node_modules/@cashfolio/book-cache-contracts",
  );
  mkdirSync(installedPackage, { recursive: true });
  cpSync(
    new URL("../package.json", import.meta.url),
    join(installedPackage, "package.json"),
  );
  cpSync(new URL("../dist", import.meta.url), join(installedPackage, "dist"), {
    recursive: true,
  });

  const result = spawnSync(
    process.execPath,
    [
      "--no-experimental-strip-types",
      "--input-type=module",
      "--eval",
      'import * as contract from "@cashfolio/book-cache-contracts"; console.log(JSON.stringify({ exports: Object.keys(contract), patterns: contract.getRestoreBookCacheKeyPatterns() }));',
    ],
    { cwd: directory, encoding: "utf8", timeout: 10_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const actual: { exports: string[]; patterns: string[] } = JSON.parse(
    result.stdout,
  );
  assert.deepEqual(actual.exports, [
    "ACCOUNT_GAIN_LOSS_BASIS_CACHE_FAMILY",
    "ACCOUNT_GAIN_LOSS_CACHE_FAMILY",
    "ACCOUNT_RETURN_CACHE_FAMILY",
    "ACCOUNT_RETURN_WORK_FAMILY",
    "PERIOD_BASE_CACHE_FAMILY",
    "PERIOD_BASE_CACHE_INDEX_FAMILY",
    "PERIOD_CACHE_GENERATION_FAMILY",
    "PERIOD_HISTORY_METRICS_CACHE_FAMILY",
    "getBookScopedRedisKeyPatterns",
    "getRestoreBookCacheKeyPatterns",
    "isBookScopedPeriodCacheKey",
  ]);
  assert.deepEqual(actual.patterns, [
    "account-book:*",
    "period:base:v*:*:*:*",
    "period:base:index:v*:*:*:*",
    "period:base:generation:v*:*:*",
    "period:history:metrics:v*:*:*:*",
    "account:gain-loss:v*:*:*:*",
    "account:gain-loss-basis:v*:*:*:*",
    "account:returns:v*:*:*:*",
    "account:returns-work:v*:*:*:*",
  ]);
});

test("source, build, and manifest subpaths are private", async () => {
  for (const subpath of ["src/index.ts", "dist/index.js", "package.json"]) {
    await assert.rejects(import(`@cashfolio/book-cache-contracts/${subpath}`), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});
