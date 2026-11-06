import assert from "node:assert/strict";
import test from "node:test";
import { previewNames } from "./names.ts";

test("preserves current branch-tail preview URLs", () => {
  const names = previewNames(42, "fix/fix-github-actions");
  assert.equal(names.flyApp, "cashfolio-app2-pr-42-fix-gh-actions");
  assert.equal(names.previewUrl, `https://${names.flyApp}.fly.dev/`);
  assert.ok(
    previewNames(999999999, "x/" + "long-".repeat(40)).flyApp.length <= 63,
  );
});
test("contains branch metacharacters as data and rejects malformed PR inputs", () => {
  assert.match(
    previewNames(42, "feature/$(whoami)").flyApp,
    /^cashfolio-app2-pr-42-[a-z0-9-]+$/,
  );
  for (const number of [-1, 0, 1.2, NaN, 1e12])
    assert.throws(() => previewNames(number, "branch"));
  assert.throws(() => previewNames(42, "branch\nINJECT=true"));
});
