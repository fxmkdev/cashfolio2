import assert from "node:assert/strict";
import test from "node:test";
import { previewNames } from "./names.ts";
import { previewPassword, identifier } from "./database.ts";

test("uses the PR title for the database and preserves branch-derived Fly naming", () => {
  const names = previewNames(
    42,
    "fix/fix-github-actions",
    "Fix: Seed the preview!",
  );
  assert.equal(names.database, "pr-42-fix-seed-the-preview-cashfolio-app2");
  assert.equal(names.flyApp, "cashfolio-app2-pr-42-fix-gh-actions");
  assert.equal(names.previewUrl, `https://${names.flyApp}.fly.dev/`);
});
test("bounds PostgreSQL and Fly identifiers with stable hash suffixes", () => {
  for (const number of [1, 999999999]) {
    const names = previewNames(
      number,
      "x/" + "long-".repeat(40),
      "long ".repeat(60),
    );
    assert.ok(names.flyApp.length <= 63);
    assert.ok(names.database.length <= 63);
    assert.match(names.database, /-[a-f0-9]{6}-cashfolio-app2$/);
    assert.deepEqual(
      previewNames(number, "x/" + "long-".repeat(40), "long ".repeat(60)),
      names,
    );
  }
});
test("contains shell metacharacters as data and rejects invalid PR numbers", () => {
  assert.equal(
    previewNames(42, "feature/$(whoami)", "$(cat /secret); test").database,
    "pr-42-cat-secret-test-cashfolio-app2",
  );
  for (const number of [-1, 0, 1.2, NaN, 1e12])
    assert.throws(() => previewNames(number, "branch", "Title"));
  assert.throws(() => previewNames(42, "branch", "Title\nINJECT=true"));
  assert.throws(() => identifier('db"; DROP DATABASE production'));
});
test("stable derived passwords are distinct per role and PR and require a strong private key", () => {
  const key = "ab".repeat(32);
  const first = previewPassword(key, 42, "app");
  assert.equal(first, previewPassword(key, 42, "app"));
  assert.notEqual(first, previewPassword(key, 42, "seed"));
  assert.notEqual(first, previewPassword(key, 43, "app"));
  assert.notEqual(first, previewPassword("cd".repeat(32), 42, "app"));
  assert.throws(() => previewPassword("short", 42, "app"));
});
